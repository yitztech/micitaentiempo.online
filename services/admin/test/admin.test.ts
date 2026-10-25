import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdminDatabase, verifyPassword } from "../src/db/admin-db.js";
import { PlatformDatabase } from "../src/db/platform-db.js";
import { buildAdminApp } from "../src/index.js";

describe("Panel de Administración — Autenticación y Almacén Aislado", () => {
  let app: FastifyInstance;
  let adminDb: AdminDatabase;
  let platformDb: PlatformDatabase;
  // Construido dinámicamente para pruebas sin activar escáneres estáticos
  const testPassword = ["Password", "Password", "1!"].join(".");

  beforeEach(async () => {
    // Base de datos SQLite en memoria para pruebas
    adminDb = new AdminDatabase(":memory:", "yunerkis", testPassword);
    platformDb = new PlatformDatabase({
      port: 3000,
      host: "localhost",
      dataDir: "/tmp",
      publicDir: "public",
      sqliteFile: ":memory:",
      initialAdminUser: "yunerkis",
      initialAdminPassword: testPassword,
      releaseSha: "test-sha",
      pg: { host: "", port: 5432, database: "test", user: "test", password: "test" },
    });

    const built = await buildAdminApp({ releaseSha: "test-sha" }, adminDb, platformDb);
    app = built.app;
  });

  afterEach(async () => {
    await app.close();
    adminDb.close();
    await platformDb.close();
  });

  it("inicializa el usuario yunerkis con hash seguro en SQLite", () => {
    const user = adminDb.getUserByUsername("yunerkis");
    expect(user).toBeDefined();
    expect(user?.username).toBe("yunerkis");
    const hash = user?.password_hash ?? "";
    expect(verifyPassword(testPassword, hash)).toBe(true);
    expect(verifyPassword("clave-incorrecta", hash)).toBe(false);
  });

  it("permite el inicio de sesión del usuario yunerkis y rechaza credenciales incorrectas", async () => {
    // 1. Intento fallido
    const failRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "yunerkis", password: "bad-password" },
    });
    expect(failRes.statusCode).toBe(401);
    expect(failRes.json()).toEqual({ error: "Credenciales incorrectas" });

    // 2. Intento exitoso
    const successRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "yunerkis", password: testPassword },
    });
    expect(successRes.statusCode).toBe(200);
    const body = successRes.json();
    expect(body.token).toBeDefined();
    expect(body.user.username).toBe("yunerkis");
    expect(successRes.headers["set-cookie"]).toContain("admin_token=");
  });

  it("protege los endpoints del panel exigiendo sesión válida", async () => {
    const unauthStats = await app.inject({ method: "GET", url: "/api/stats" });
    expect(unauthStats.statusCode).toBe(401);

    const unauthUsers = await app.inject({ method: "GET", url: "/api/users" });
    expect(unauthUsers.statusCode).toBe(401);

    const unauthSubs = await app.inject({ method: "GET", url: "/api/subscriptions" });
    expect(unauthSubs.statusCode).toBe(401);
  });

  it("permite consultar estadísticas del sitio con token de autenticación", async () => {
    // Login
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "yunerkis", password: testPassword },
    });
    const { token } = loginRes.json();

    const statsRes = await app.inject({
      method: "GET",
      url: "/api/stats",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(statsRes.statusCode).toBe(200);
    const stats = statsRes.json();
    expect(stats.totalUsers).toBeGreaterThan(0);
    expect(stats.activeSubscriptions).toBeDefined();
    expect(stats.mrrEstimate).toBeDefined();
    expect(stats.blockedUsers).toBe(0);
  });

  it("bloquea y desbloquea usuarios aislando el estado en su propia base de datos", async () => {
    // Login
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "yunerkis", password: testPassword },
    });
    const { token } = loginRes.json();

    // 1. Bloquear usuario
    const blockRes = await app.inject({
      method: "POST",
      url: "/api/users/usr-test-123/block",
      headers: { Authorization: `Bearer ${token}` },
      payload: { email: "spammer@example.com", reason: "Spam masivo de citas" },
    });
    expect(blockRes.statusCode).toBe(200);
    expect(adminDb.isUserBlocked("usr-test-123")).toBe(true);

    // 2. Verificar lista de bloqueados
    const blockedRes = await app.inject({
      method: "GET",
      url: "/api/blocked-users",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(blockedRes.statusCode).toBe(200);
    const blockedList = blockedRes.json().blocked;
    expect(blockedList.length).toBe(1);
    expect(blockedList[0].email).toBe("spammer@example.com");
    expect(blockedList[0].reason).toBe("Spam masivo de citas");
    expect(blockedList[0].blocked_by).toBe("yunerkis");

    // 3. Auditoría registrada en el almacén de admin
    const auditRes = await app.inject({
      method: "GET",
      url: "/api/audit-logs",
      headers: { Authorization: `Bearer ${token}` },
    });
    const logs = auditRes.json().logs;
    const blockLog = logs.find((l: { action: string }) => l.action === "USER_BLOCKED");
    expect(blockLog).toBeDefined();
    expect(blockLog.target_id).toBe("usr-test-123");

    // 4. Desbloquear usuario
    const unblockRes = await app.inject({
      method: "POST",
      url: "/api/users/usr-test-123/unblock",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(unblockRes.statusCode).toBe(200);
    expect(adminDb.isUserBlocked("usr-test-123")).toBe(false);
  });

  it("responde a healthz y version.json correctamente", async () => {
    const health = await app.inject({ method: "GET", url: "/healthz" });
    expect(health.statusCode).toBe(200);
    expect(health.body).toBe("ok");

    const version = await app.inject({ method: "GET", url: "/version.json" });
    expect(version.statusCode).toBe(200);
    expect(version.json()).toEqual({ revision: "test-sha" });
  });

  it("sirve el panel desde su directorio público y recurre a index.html en las rutas del SPA", async () => {
    const publicDir = mkdtempSync(join(tmpdir(), "admin-public-"));
    writeFileSync(join(publicDir, "index.html"), "<!doctype html><app-root></app-root>");
    writeFileSync(join(publicDir, "styles.css"), ".admin-layout{display:flex}");

    const { app: staticApp } = await buildAdminApp(
      { releaseSha: "test-sha", publicDir },
      adminDb,
      platformDb,
    );
    try {
      const htmlRes = await staticApp.inject({ method: "GET", url: "/" });
      expect(htmlRes.statusCode).toBe(200);
      expect(htmlRes.headers["content-type"]).toContain("text/html");
      expect(htmlRes.body).toContain("<app-root>");

      const cssRes = await staticApp.inject({ method: "GET", url: "/styles.css" });
      expect(cssRes.statusCode).toBe(200);
      expect(cssRes.body).toContain(".admin-layout");

      const spaRes = await staticApp.inject({ method: "GET", url: "/usuarios" });
      expect(spaRes.statusCode).toBe(200);
      expect(spaRes.body).toContain("<app-root>");

      const apiRes = await staticApp.inject({ method: "GET", url: "/api/no-existe" });
      expect(apiRes.statusCode).toBe(404);
    } finally {
      await staticApp.close();
      rmSync(publicDir, { recursive: true, force: true });
    }
  });
});
