import { randomUUID } from "node:crypto";
import { expect, request as playwrightRequest } from "@playwright/test";
import { actor } from "../fixtures/actores";
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
