import { randomUUID } from "node:crypto";
import { expect, request as playwrightRequest } from "@playwright/test";
import { actor, CLAVE } from "../fixtures/actores";
import { sitio, Then, When } from "../fixtures/sitio";

Then("cada propietario ve únicamente los datos de su propia sesión", async ({ estado }) => {
  for (const nombre of ["Ana", "Intrusa"]) {
    const a = actor(estado, nombre);
    const response = await a.api.get("/api/v1/me");
    expect(response.status()).toBe(200);
    const me = (await response.json()) as { email: string; organization: { id: string } };
    expect(me.email).toBe(a.email);
    expect(me.organization.id).toBe(a.orgId);
  }
});

Then("una petición sin sesión no puede consultar el panel privado", async () => {
  const anonymous = await playwrightRequest.newContext({ baseURL: sitio.es });
  try {
    expect((await anonymous.get("/api/v1/me")).status()).toBe(401);
    const page = await anonymous.get("/panel", { maxRedirects: 0 });
    expect(page.status()).toBe(302);
    expect(page.headers().location).toContain("/entrar");
  } finally {
    await anonymous.dispose();
  }
});

When("{string} intenta modificar el tablero ajeno", async ({ estado }, nombre: string) => {
  const id = (estado.tablero as { id: string }).id;
  const res = await actor(estado, nombre).api.put(`/api/v1/calendars/${id}/hours`, { data: { shifts: [] } });
  estado.status = res.status();
  estado.body = await res.text();
});

When("{string} cierra su sesión", async ({ estado }, nombre: string) => {
  const response = await actor(estado, nombre).api.post("/api/auth/sign-out");
  expect(response.status(), await response.text()).toBe(200);
});

Then(
  "la sesión de {string} queda cerrada y la de {string} sigue activa",
  async ({ estado }, salio: string, sigue: string) => {
    expect((await actor(estado, salio).api.get("/api/v1/me")).status()).toBe(401);
    const otro = actor(estado, sigue);
    const response = await otro.api.get("/api/v1/me");
    expect(response.status()).toBe(200);
    expect((await response.json()) as { email: string }).toMatchObject({ email: otro.email });
  },
);

Then(
  "{string} puede consultar el tablero y la facturación en solo lectura",
  async ({ estado }, nombre: string) => {
    const a = actor(estado, nombre);
    const id = (estado.tablero as { id: string }).id;
    expect((await a.api.get(`/api/v1/calendars/${id}`)).status()).toBe(200);
    expect((await a.api.get("/api/v1/billing")).status()).toBe(200);
    expect((await a.api.get("/api/business-profile")).status()).toBe(200);
  },
);

Then(
  "{string} no puede invitar miembros ni modificar el perfil del negocio",
  async ({ estado }, nombre: string) => {
    const a = actor(estado, nombre);
    const id = (estado.tablero as { id: string }).id;
    const invitation = await a.api.post(`/api/v1/calendars/${id}/invitations`, {
      data: { email: `invitado-${randomUUID()}@escenarios.test`, role: "observer" },
    });
    expect(invitation.status(), await invitation.text()).toBe(403);
    expect(await invitation.json()).toMatchObject({ code: "org_read_only" });
    const current = await a.api.get("/api/business-profile");
    expect(current.status(), await current.text()).toBe(200);
    const value = (await current.json()) as {
      version: number;
      content: {
        description: string | null;
        primaryCategory: string | null;
        secondaryCategories: string[];
        websiteUrl: string | null;
        termsUrl: string | null;
        socialLinks: unknown[];
      };
    };
    const profile = await a.api.patch("/api/business-profile", {
      headers: { "Idempotency-Key": randomUUID() },
      data: {
        expectedVersion: value.version,
        ...value.content,
        displayName: "Cambio no permitido",
      },
    });
    expect(profile.status(), await profile.text()).toBe(403);
    expect(await profile.json()).toMatchObject({ code: "org_read_only" });
  },
);

const ADMIN_URL = process.env.ADMIN_URL ?? "http://admin.localhost:8080";
const ADMIN_USER = process.env.ADMIN_INITIAL_USER ?? "admin-ci";
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD ?? "ci-only-admin-password-not-for-production";

/** Opera el panel de administración real (gateway → admin → PostgreSQL) para bloquear o desbloquear. */
async function restriccion(nombre: string, estado: Record<string, unknown>, accion: "block" | "unblock") {
  const a = actor(estado, nombre);
  const admin = await playwrightRequest.newContext({ baseURL: ADMIN_URL });
  try {
    const login = await admin.post("/api/auth/login", {
      data: { username: ADMIN_USER, password: ADMIN_PASSWORD },
    });
    expect(login.status(), await login.text()).toBe(200);
    const { token } = (await login.json()) as { token: string };
    const headers = { Authorization: `Bearer ${token}` };
    const lista = await admin.get(`/api/users?q=${encodeURIComponent(a.email)}`, { headers });
    expect(lista.status(), await lista.text()).toBe(200);
    const { users } = (await lista.json()) as { users: Array<{ id: string; email: string }> };
    const usuario = users.find((u) => u.email === a.email);
    if (!usuario) throw new Error(`Usuario no encontrado en el panel: ${a.email}`);
    const res = await admin.post(`/api/users/${usuario.id}/${accion}`, {
      headers,
      data: accion === "block" ? { reason: "Regresión S06" } : {},
    });
    expect([200, 202], await res.text()).toContain(res.status());
  } finally {
    await admin.dispose();
  }
}

When("la administración bloquea a {string}", async ({ estado }, nombre: string) => {
  await restriccion(nombre, estado, "block");
});

When("la administración desbloquea a {string}", async ({ estado }, nombre: string) => {
  await restriccion(nombre, estado, "unblock");
});

When("{string} obtiene un token Bearer de su sesión", async ({ estado }, nombre: string) => {
  const a = actor(estado, nombre);
  const res = await a.api.post("/api/auth/sign-in/email", { data: { email: a.email, password: CLAVE } });
  expect(res.status(), await res.text()).toBe(200);
  const token = res.headers()["set-auth-token"];
  expect(token, "Better Auth debe devolver set-auth-token").toBeTruthy();
  estado.bearer = {
    ...((estado.bearer as Record<string, string> | undefined) ?? {}),
    [nombre]: String(token),
  };
});

Then("la sesión por cookie de {string} es rechazada con 401", async ({ estado }, nombre: string) => {
  const res = await actor(estado, nombre).api.get("/api/v1/me");
  expect(res.status()).toBe(401);
});

Then("el token Bearer de {string} es rechazado con 401", async ({ estado }, nombre: string) => {
  const a = actor(estado, nombre);
  const anonimo = await playwrightRequest.newContext({ baseURL: sitio[a.dominio] });
  try {
    const res = await anonimo.get("/api/v1/me", {
      headers: { Authorization: `Bearer ${(estado.bearer as Record<string, string>)[nombre]}` },
    });
    expect(res.status()).toBe(401);
  } finally {
    await anonimo.dispose();
  }
});

Then(
  "{string} no puede entrar con su contraseña y recibe un 401 genérico",
  async ({ estado }, nombre: string) => {
    const a = actor(estado, nombre);
    const res = await a.api.post("/api/auth/sign-in/email", { data: { email: a.email, password: CLAVE } });
    expect(res.status()).toBe(401);
    const texto = await res.text();
    expect(texto).not.toMatch(/bloquead|blocked|restrict|Regresión/i);
    expect(res.headers()["set-cookie"]).toBeUndefined();
  },
);

Then("{string} puede entrar de nuevo con su contraseña", async ({ estado }, nombre: string) => {
  const a = actor(estado, nombre);
  const res = await a.api.post("/api/auth/sign-in/email", { data: { email: a.email, password: CLAVE } });
  expect(res.status(), await res.text()).toBe(200);
  expect((await a.api.get("/api/v1/me")).status()).toBe(200);
});

Then("el token MCP de la conexión es rechazado con 401 invalid_token", async ({ estado }) => {
  const c = estado.mcp as { accessToken: string; dominio: "es" | "en" };
  const anonimo = await playwrightRequest.newContext({ baseURL: sitio[c.dominio] });
  try {
    const res = await anonimo.post("/mcp", {
      headers: {
        Authorization: `Bearer ${c.accessToken}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    });
    expect(res.status(), await res.text()).toBe(401);
    expect(res.headers()["www-authenticate"] ?? "").toContain("invalid_token");
  } finally {
    await anonimo.dispose();
  }
});

Then("el calendario público del tablero responde {int}", async ({ estado }, codigo: number) => {
  const t = estado.tablero as { slug: string };
  const res = await (await playwrightRequest.newContext({ baseURL: sitio.es })).get(
    `/api/public/v1/calendars/${t.slug}`,
  );
  expect(res.status(), await res.text()).toBe(codigo);
});

Then("{string} puede cambiar el horario del tablero", async ({ estado }, nombre: string) => {
  const res = await actor(estado, nombre).api.put(
    `/api/v1/calendars/${(estado.tablero as { id: string }).id}/hours`,
    { data: { shifts: [] } },
  );
  expect(res.status(), await res.text()).toBeLessThan(300);
});

Then("{string} sigue viendo el tablero con acceso de lectura", async ({ estado }, nombre: string) => {
  const res = await actor(estado, nombre).api.get(
    `/api/v1/calendars/${(estado.tablero as { id: string }).id}`,
  );
  expect(res.status(), await res.text()).toBe(200);
});
