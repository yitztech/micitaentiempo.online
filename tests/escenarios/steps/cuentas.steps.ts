import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { enlace, esperarCorreo } from "../fixtures/correo";
import { Given, idioma, sitio, Then, When } from "../fixtures/sitio";

type Persona = { email: string; dominio: "es" | "en" };

Given(
  "una persona nueva con correo único {string} en el dominio {string}",
  ({ estado }, prefijo: string, dominio: string) => {
    estado.persona = {
      email: `${prefijo}-${randomUUID().slice(0, 8)}@escenarios.test`,
      dominio: idioma(dominio),
    } satisfies Persona;
  },
);

Given(
  "una persona con el correo {string} en el dominio {string}",
  ({ estado }, email: string, dominio: string) => {
    estado.persona = { email, dominio: idioma(dominio) } satisfies Persona;
  },
);

When(
  "se registra como {string} con la contraseña {string}",
  async ({ request, estado }, nombre: string, clave: string) => {
    const p = estado.persona as Persona;
    const res = await request.post(`${sitio[p.dominio]}/api/auth/sign-up/email`, {
      data: { name: nombre, email: p.email, password: clave },
      headers: { Origin: sitio[p.dominio] },
    });
    estado.status = res.status();
    estado.body = await res.text();
  },
);

Then(
  "recibe un correo con asunto {string} desde {string}",
  async ({ request, estado }, asunto: string, remitente: string) => {
    const p = estado.persona as Persona;
    const correo = await esperarCorreo(request, p.email);
    expect(correo.subject).toBe(asunto);
    expect(correo.from).toContain(remitente);
    estado.correo = correo;
  },
);

async function entrar(
  request: import("@playwright/test").APIRequestContext,
  p: Persona,
  clave: string,
): Promise<{ status: number; body: string }> {
  const res = await request.post(`${sitio[p.dominio]}/api/auth/sign-in/email`, {
    data: { email: p.email, password: clave },
    headers: { Origin: sitio[p.dominio] },
  });
  return { status: res.status(), body: await res.text() };
}

When("intenta entrar con la contraseña {string}", async ({ request, estado }, clave: string) => {
  Object.assign(estado, await entrar(request, estado.persona as Persona, clave));
});

When("entra con la contraseña {string}", async ({ request, estado }, clave: string) => {
  Object.assign(estado, await entrar(request, estado.persona as Persona, clave));
});

When("abre el enlace de verificación del correo", async ({ request, estado }) => {
  const url = enlace(estado.correo as Parameters<typeof enlace>[0], "/api/auth/verify-email");
  const res = await request.get(url, { maxRedirects: 0 });
  expect([200, 302]).toContain(res.status());
});

Then("su cuenta tiene el idioma {string}", async ({ request, estado }, lang: string) => {
  const p = estado.persona as Persona;
  const res = await request.get(`${sitio[p.dominio]}/api/v1/me`);
  expect(res.status()).toBe(200);
  expect(((await res.json()) as { locale: string }).locale).toBe(lang);
});

Given(
  "una persona registrada y verificada con correo único {string} en el dominio {string}",
  async ({ request, estado }, prefijo: string, dominio: string) => {
    const p: Persona = {
      email: `${prefijo}-${randomUUID().slice(0, 8)}@escenarios.test`,
      dominio: idioma(dominio),
    };
    estado.persona = p;
    const clave = "una-clave-bien-larga-2026";
    const alta = await request.post(`${sitio[p.dominio]}/api/auth/sign-up/email`, {
      data: { name: "Persona de prueba", email: p.email, password: clave },
      headers: { Origin: sitio[p.dominio] },
    });
    expect(alta.status()).toBe(200);
    const correo = await esperarCorreo(request, p.email);
    await request.get(enlace(correo, "/api/auth/verify-email"), { maxRedirects: 0 });
    const login = await entrar(request, p, clave);
    expect(login.status).toBe(200);
  },
);

When("consulta su cuenta en el dominio {string}", async ({ request, estado }, dominio: string) => {
  const res = await request.get(`${sitio[idioma(dominio)]}/api/v1/me`);
  estado.status = res.status();
  estado.body = await res.text();
});

When(
  "crea la organización {string} con el plan {string}",
  async ({ request, estado }, nombre: string, plan: string) => {
    const p = estado.persona as Persona;
    const res = await request.post(`${sitio[p.dominio]}/api/v1/org`, {
      data: { name: nombre, plan },
      headers: { Origin: sitio[p.dominio] },
    });
    estado.status = res.status();
    estado.body = await res.text();
  },
);

Then("la organización está en prueba hasta dentro de {int} días", ({ estado }, dias: number) => {
  const org = JSON.parse(String(estado.body)) as { status: string; trialEndsAt: string };
  expect(org.status).toBe("trialing");
  const diff = (new Date(org.trialEndsAt).getTime() - Date.now()) / 86_400_000;
  expect(diff).toBeGreaterThan(dias - 0.1);
  expect(diff).toBeLessThan(dias + 0.1);
});

Then("su límite de tableros es {int}", ({ estado }, n: number) => {
  expect((JSON.parse(String(estado.body)) as { limits: { calendars: number } }).limits.calendars).toBe(n);
});
