import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { AdminDatabase, verifyPassword } from "../src/db/admin-db.js";
import {
  PlatformDatabase,
  PlatformDatabaseUnavailableError,
  PlatformRestrictionNotFoundError,
} from "../src/db/platform-db.js";
import { buildAdminApp } from "../src/index.js";

describe("Panel de Administración — Autenticación y Almacén Aislado", () => {
  let app: FastifyInstance;
  let adminDb: AdminDatabase;
  let platformDb: PlatformDatabase;
  let testPassword: string;

  beforeEach(async () => {
    testPassword = randomBytes(24).toString("base64url");
    vi.stubEnv("ADMIN_INITIAL_USER", "yunerkis");
    vi.stubEnv("ADMIN_INITIAL_PASSWORD", testPassword);
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
    vi.unstubAllEnvs();
  });

  it("falla antes de iniciar cuando falta una credencial inicial", () => {
    vi.stubEnv("ADMIN_INITIAL_USER", "");
    expect(() => loadConfig()).toThrow("ADMIN_INITIAL_USER es obligatoria");
    vi.stubEnv("ADMIN_INITIAL_USER", "yunerkis");
    vi.stubEnv("ADMIN_INITIAL_PASSWORD", "");
    expect(() => loadConfig()).toThrow("ADMIN_INITIAL_PASSWORD es obligatoria");
  });

  it("exige la contraseña de PostgreSQL si hay servidor configurado, sin valor de respaldo", () => {
    vi.stubEnv("DB_PASSWORD", "");
    vi.stubEnv("API_DB_PASSWORD", "");
    vi.stubEnv("DB_HOST", "postgres");
    expect(() => loadConfig()).toThrow("DB_PASSWORD es obligatoria");
    vi.stubEnv("DB_HOST", "");
    expect(loadConfig().pg.password).toBe("");
    vi.stubEnv("DB_HOST", "postgres");
    vi.stubEnv("API_DB_PASSWORD", "secreto-efimero");
    expect(loadConfig().pg.password).toBe("secreto-efimero");
  });

  it("carga credenciales iniciales explícitas y limita sus longitudes", () => {
    const config = loadConfig();
    expect(config.initialAdminUser).toBe("yunerkis");
    expect(config.initialAdminPassword).toBe(testPassword);

    vi.stubEnv("ADMIN_INITIAL_USER", "u".repeat(101));
    expect(() => loadConfig()).toThrow("ADMIN_INITIAL_USER no puede superar 100 caracteres");
    vi.stubEnv("ADMIN_INITIAL_USER", "Admin");
    expect(() => loadConfig()).toThrow("ADMIN_INITIAL_USER debe estar en minúsculas");
    vi.stubEnv("ADMIN_INITIAL_USER", "yunerkis");
    vi.stubEnv("ADMIN_INITIAL_PASSWORD", "p".repeat(129));
    expect(() => loadConfig()).toThrow("ADMIN_INITIAL_PASSWORD no puede superar 128 caracteres");
  });

  it("no cambia el hash de una cuenta SQLite existente al reiniciar con otro valor inicial", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "admin-initial-credentials-"));
    const databasePath = join(dataDir, "admin.sqlite");
    const nextPassword = randomBytes(24).toString("base64url");
    try {
      const firstStart = new AdminDatabase(databasePath, "yunerkis", testPassword);
      const originalHash = firstStart.getUserByUsername("yunerkis")?.password_hash;
      firstStart.close();

      const restart = new AdminDatabase(databasePath, "yunerkis", nextPassword);
      const storedHash = restart.getUserByUsername("yunerkis")?.password_hash;
      expect(storedHash).toBe(originalHash);
      expect(verifyPassword(testPassword, storedHash ?? "")).toBe(true);
      expect(verifyPassword(nextPassword, storedHash ?? "")).toBe(false);
      restart.close();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
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
    const blockedAt = new Date().toISOString();
    vi.spyOn(platformDb, "setUserRestriction").mockResolvedValue({
      userId: "usr-test-123",
      email: "spammer@example.com",
      reason: "Spam masivo de citas",
      blockedAt,
      blockedBy: "yunerkis",
      reconciliationRequired: false,
      changed: true,
      calendarStatusPending: false,
    });
    vi.spyOn(platformDb, "getBlockedUsers").mockResolvedValue([
      {
        user_id: "usr-test-123",
        email: "spammer@example.com",
        reason: "Spam masivo de citas",
        blocked_at: blockedAt,
        blocked_by: "yunerkis",
        reconciliation_required: false,
      },
    ]);
    vi.spyOn(platformDb, "removeUserRestriction").mockResolvedValue({
      userId: "usr-test-123",
      email: "spammer@example.com",
      reason: "Spam masivo de citas",
      blockedAt,
      blockedBy: "yunerkis",
      reconciliationRequired: false,
      changed: true,
      calendarStatusPending: false,
    });
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
    const retryBlock = await app.inject({
      method: "POST",
      url: "/api/users/usr-test-123/block",
      headers: { Authorization: `Bearer ${token}` },
      payload: { reason: "Spam masivo de citas" },
    });
    expect(retryBlock.statusCode).toBe(200);

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
    expect(logs.filter((l: { action: string }) => l.action === "USER_BLOCKED")).toHaveLength(1);

    // 4. Desbloquear usuario
    const unblockRes = await app.inject({
      method: "POST",
      url: "/api/users/usr-test-123/unblock",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(unblockRes.statusCode).toBe(200);
    expect(adminDb.isUserBlocked("usr-test-123")).toBe(false);
    const retryUnblock = await app.inject({
      method: "POST",
      url: "/api/users/usr-test-123/unblock",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(retryUnblock.statusCode).toBe(200);
    expect(
      adminDb.getAuditLogs().filter((l) => l.action === "USER_UNBLOCKED" && l.target_id === "usr-test-123"),
    ).toHaveLength(1);
  });

  it("un reintento de desbloqueo no duplica la auditoría aunque todo ocurra en el mismo milisegundo", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-04T12:00:00Z") });
    try {
      for (let i = 0; i < 40; i++) {
        const userId = `usr-empate-${i}`;
        adminDb.blockUser(userId, "empate@example.com", "Prueba", "yunerkis");
        adminDb.unblockUser(userId, "yunerkis");
        adminDb.unblockUser(userId, "yunerkis");
      }
      const unblocked = adminDb.getAuditLogs(200).filter((l) => l.action === "USER_UNBLOCKED");
      expect(unblocked).toHaveLength(40);
    } finally {
      vi.useRealTimers();
    }
  });

  it("no registra como bloqueado en SQLite si PostgreSQL no confirma la restricción", async () => {
    vi.spyOn(platformDb, "setUserRestriction").mockRejectedValue(new PlatformDatabaseUnavailableError());
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "yunerkis", password: testPassword },
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/users/usr-test-123/block",
      headers: { Authorization: `Bearer ${login.json().token}` },
      payload: { reason: "Abuso" },
    });
    expect(response.statusCode).toBe(503);
    expect(adminDb.isUserBlocked("usr-test-123")).toBe(false);
  });

  it("concilia una suspensión histórica y valida la entrada", async () => {
    const reconcile = vi.spyOn(platformDb, "reconcileRestriction").mockResolvedValue({
      userId: "usr-test-123",
      email: "historica@example.com",
      changed: true,
      organizationIds: ["org-1"],
      calendarStatusPending: true,
    });
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "yunerkis", password: testPassword },
    });
    const post = (payload: Record<string, unknown>) =>
      app.inject({
        method: "POST",
        url: "/api/users/usr-test-123/reconcile",
        headers: { Authorization: `Bearer ${login.json().token}` },
        payload,
      });

    const suspended = await post({ economicStatus: "suspended", reason: "Revisado" });
    expect(suspended.statusCode).toBe(422);
    expect(suspended.json().code).toBe("invalid_economic_status");
    const noReason = await post({ economicStatus: "active", reason: "   " });
    expect(noReason.statusCode).toBe(422);
    expect(noReason.json().code).toBe("invalid_reconciliation_reason");
    expect(reconcile).not.toHaveBeenCalled();

    const accepted = await post({ economicStatus: "active", reason: " Revisado en Stripe " });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json()).toMatchObject({ reconciled: true, code: "restriction_sync_pending" });
    expect(reconcile).toHaveBeenCalledWith("usr-test-123", "active", "Revisado en Stripe", "yunerkis");
    expect(adminDb.getAuditLogs().filter((l) => l.action === "USER_RESTRICTION_RECONCILED")).toHaveLength(1);

    reconcile.mockRejectedValue(new PlatformRestrictionNotFoundError());
    const missing = await post({ economicStatus: "active", reason: "Revisado" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe("restriction_not_found");
  });

  describe("acceso al panel", () => {
    const login = (password: string, ip = "203.0.113.5", username = "yunerkis", proto = "https") =>
      app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-forwarded-for": ip, "x-forwarded-proto": proto },
        payload: { username, password },
      });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("bloquea la IP tras 5 fallos, aunque después acierte, y libera al pasar la ventana", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-04T12:00:00Z") });
      for (let i = 0; i < 5; i++) expect((await login("incorrecta")).statusCode).toBe(401);

      const blocked = await login(testPassword);
      expect(blocked.statusCode).toBe(429);
      expect(Number(blocked.headers["retry-after"])).toBe(900);
      expect(adminDb.getAuditLogs().filter((l) => l.action === "LOGIN_RATE_LIMITED")).toHaveLength(1);

      expect((await login(testPassword, "198.51.100.7")).statusCode).toBe(200);

      vi.setSystemTime(new Date("2026-11-04T12:15:01Z"));
      expect((await login(testPassword)).statusCode).toBe(200);
    });

    it("limita la cuenta aunque cada intento venga de una IP distinta", async () => {
      for (let i = 0; i < 20; i++) await login("incorrecta", `198.51.100.${i}`);
      expect((await login(testPassword, "198.51.100.200")).statusCode).toBe(429);
    });

    it("un acceso correcto reinicia los fallos", async () => {
      for (let i = 0; i < 4; i++) await login("incorrecta");
      expect((await login(testPassword)).statusCode).toBe(200);
      for (let i = 0; i < 4; i++) expect((await login("incorrecta")).statusCode).toBe(401);
      expect((await login(testPassword)).statusCode).toBe(200);
    });

    it("los fallos sobreviven a un reinicio del servicio", async () => {
      for (let i = 0; i < 5; i++) await login("incorrecta");
      await app.close();
      app = (await buildAdminApp({ releaseSha: "test-sha" }, adminDb, platformDb)).app;
      expect((await login(testPassword)).statusCode).toBe(429);
    });

    it("no guarda en claro lo escrito como usuario", async () => {
      await login("incorrecta", "203.0.113.5", "una-contrasena-en-el-campo-equivocado");
      const key = createHash("sha256").update("account:una-contrasena-en-el-campo-equivocado").digest("hex");
      expect(adminDb.getLoginFailures(key)?.failures).toBe(1);
      expect(adminDb.getLoginFailures("account:una-contrasena-en-el-campo-equivocado")).toBeUndefined();
    });

    it("marca la cookie como Secure solo si el cliente llegó por HTTPS", async () => {
      const https = await login(testPassword);
      expect(https.headers["set-cookie"]).toContain("; Secure");
      expect(https.headers["set-cookie"]).toContain("HttpOnly");

      const http = await login(testPassword, "203.0.113.5", "yunerkis", "http");
      expect(http.headers["set-cookie"]).not.toContain("Secure");

      const logout = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { authorization: `Bearer ${https.json().token}`, "x-forwarded-proto": "https" },
      });
      expect(logout.headers["set-cookie"]).toContain("Max-Age=0; Secure");
    });
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
