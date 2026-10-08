import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { type APIRequestContext, type BrowserContext, expect, type Page } from "@playwright/test";
import { actor, actores, CLAVE, nuevoContexto } from "../fixtures/actores";
import { enlace, esperarCorreo } from "../fixtures/correo";
import { Given, idioma, sitio, Then, When } from "../fixtures/sitio";

const tablero = (estado: Record<string, unknown>) => estado.tablero as { id: string; slug: string };

/** Pasa la sesión de un actor (cookies de su contexto HTTP) al navegador. */
async function iniciarEnNavegador(context: BrowserContext, api: APIRequestContext) {
  await context.addCookies((await api.storageState()).cookies);
}

/** Código del último correo con código enviado a esa dirección desde `desde` (ms). */
async function codigo(request: APIRequestContext, email: string, desde = 0): Promise<string> {
  const correo = await esperarCorreo(request, email, { asunto: /\d{6}/, despuesDe: desde });
  const c = correo.subject.match(/\d{6}/)?.[0] ?? correo.text.match(/\b\d{6}\b/)?.[0];
  if (!c) throw new Error("sin código");
  return c;
}

Given(
  "un usuario {string} registrado sin negocio en el dominio {string}",
  async ({ request, estado }, nombre: string, dominio: string) => {
    const api = await nuevoContexto(idioma(dominio));
    const email = `${nombre.toLowerCase()}-${randomUUID().slice(0, 8)}@escenarios.test`;
    const alta = await api.post("/api/auth/sign-up/email", {
      data: { name: nombre, email, password: CLAVE },
    });
    expect(alta.status(), await alta.text()).toBe(200);
    await api.get(enlace(await esperarCorreo(request, email), "/api/auth/verify-email"), { maxRedirects: 0 });
    const login = await api.post("/api/auth/sign-in/email", { data: { email, password: CLAVE } });
    expect(login.status()).toBe(200);
    actores(estado)[nombre] = { nombre, email, dominio: idioma(dominio), api };
    estado.propietario = nombre;
  },
);

When("{string} abre su panel", async ({ page, estado }, nombre: string) => {
  const a = actor(estado, nombre);
  await iniciarEnNavegador(page.context(), a.api);
  await page.goto(`${sitio[a.dominio]}${a.dominio === "es" ? "/panel" : "/dashboard"}`);
});

Then("ve el asistente de alta", async ({ page }) => {
  await expect(page).toHaveURL(/\/(bienvenida|welcome)$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

When(
  "{string} completa el asistente con el negocio {string} y el tablero {string}",
  async ({ page }, _nombre: string, negocio: string, nombreTablero: string) => {
    await page.getByLabel("Nombre del negocio").fill(negocio);
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.getByLabel("Nombre del tablero").fill(nombreTablero);
    await page.getByLabel("Zona horaria").selectOption("America/Mexico_City");
    await page.getByLabel("País").selectOption("MX");
    await page.getByRole("button", { name: "Siguiente" }).click();
    await expect(page.getByRole("heading", { name: "¿Cuándo atiendes?" })).toBeVisible();
    await page.getByRole("button", { name: "Siguiente" }).click();
    await expect(page.getByRole("heading", { name: "Feriados", exact: true })).toBeVisible();
    await expect(page.getByText("Día de la Independencia")).toBeVisible();
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.getByLabel("Nombre del servicio").fill("Facial");
    await page.getByRole("button", { name: "Siguiente" }).click();
  },
);

Then("ve el enlace de reserva del tablero", async ({ page }) => {
  await expect(page.getByLabel("Enlace de reserva")).toHaveValue(/\/reservar\/cabina-1/);
});

Then(
  "el tablero {string} tiene horario, feriados de {string} y un servicio",
  async ({ estado }, nombreTablero: string, pais: string) => {
    const api = actor(estado, String(estado.propietario)).api;
    const lista = (await (await api.get("/api/v1/calendars")).json()) as Array<{ id: string; name: string }>;
    const c = lista.find((x) => x.name === nombreTablero);
    expect(c).toBeTruthy();
    const sched = (await (await api.get(`/api/v1/calendars/${c?.id}/schedule`)).json()) as {
      shifts: unknown[];
      holidayPolicies: Array<{ country: string }>;
    };
    expect(sched.shifts.length).toBeGreaterThan(0);
    expect(sched.holidayPolicies[0]?.country).toBe(pais);
    const svcs = (await (await api.get(`/api/v1/calendars/${c?.id}/services`)).json()) as unknown[];
    expect(svcs).toHaveLength(1);
  },
);

When("{string} abre el calendario del tablero", async ({ page, estado }, nombre: string) => {
  const a = actor(estado, nombre);
  await iniciarEnNavegador(page.context(), a.api);
  const base = a.dominio === "es" ? "/panel/calendarios/" : "/dashboard/calendars/";
  await page.goto(`${sitio[a.dominio]}${base}${tablero(estado).id}`);
  await expect(page.locator(".board-calendar")).toBeVisible({ timeout: 15_000 });
});

When(
  "crea una cita del {string} a las {string} que se repite cada semana {int} veces",
  async ({ page }, fecha: string, hora: string, n: number) => {
    await page.getByRole("button", { name: "Nueva cita" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Fecha", { exact: true }).fill(fecha);
    await d.getByLabel("Inicio").fill(hora);
    await d.getByLabel("Nombre del cliente").fill("Ana");
    await d.getByLabel("Repetir").selectOption("weekly");
    await d.getByLabel("Termina").selectOption("count");
    await d.getByLabel("Número de veces").fill(String(n));
    await d.getByRole("button", { name: "Guardar" }).click();
    await expect(d).toBeHidden();
  },
);

async function eventos(estado: Record<string, unknown>) {
  const api = actor(estado, String(estado.propietario)).api;
  const res = await api.get(`/api/v1/calendars/${tablero(estado).id}/events`, {
    params: { from: "2026-09-01T00:00:00Z", to: "2026-12-31T00:00:00Z" },
  });
  return (await res.json()) as Array<{ kind: string; start: string; recurrence: unknown }>;
}

Then("el tablero tiene {int} citas de la serie", async ({ estado }, n: number) => {
  expect((await eventos(estado)).filter((e) => e.recurrence)).toHaveLength(n);
});

When(
  "bloquea desde el calendario el {string} de {string} a {string}",
  async ({ page }, fecha: string, de: string, a: string) => {
    await page.getByRole("button", { name: "Bloquear horario" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Fecha", { exact: true }).fill(fecha);
    await d.getByLabel("Inicio").fill(de);
    await d.getByLabel("Fin", { exact: true }).fill(a);
    await d.getByRole("button", { name: "Guardar" }).click();
    await expect(d).toBeHidden();
  },
);

Then("el tablero tiene un bloqueo el {string}", async ({ estado }, fecha: string) => {
  const bloques = (await eventos(estado)).filter((e) => e.kind === "block");
  expect(
    bloques.map((b) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date(b.start)),
    ),
  ).toContain(fecha);
});

// ── Reserva en la interfaz ──

When(
  "la visitante {string} abre la página de reserva del tablero en el dominio {string}",
  async ({ page, estado }, nombre: string, dominio: string) => {
    const lang = idioma(dominio);
    estado.visitanteUi = {
      nombre,
      email: `${nombre.toLowerCase()}-${randomUUID().slice(0, 8)}@escenarios.test`,
      lang,
    };
    await page.goto(`${sitio[lang]}${lang === "es" ? "/reservar/" : "/book/"}${tablero(estado).slug}`);
  },
);

When("elige el primer día y la primera hora libres", async ({ page }) => {
  const dia = page.locator("button[aria-pressed]:not([disabled])").first();
  await expect(dia).toBeVisible({ timeout: 15_000 });
  await dia.click();
  await page.locator('[aria-labelledby="titulo-hora"] ul button').first().click();
  const continuar = page.getByRole("button", { name: /Continuar con este horario|Continue with this time/ });
  if (await continuar.isVisible({ timeout: 2000 }).catch(() => false)) {
    await continuar.scrollIntoViewIfNeeded();
    await continuar.click({ force: true });
  }
});

When("escribe sus datos y aparta el horario", async ({ page, estado }) => {
  const v = estado.visitanteUi as { nombre: string; email: string; lang: "es" | "en" };
  const es = v.lang === "es";
  await page.getByLabel(es ? "Nombre completo" : "Full name").fill(v.nombre);
  await page.getByLabel(es ? "Correo" : "Email", { exact: true }).fill(v.email);
  const boton = page.getByRole("button", { name: es ? "Apartar este horario" : "Hold this time" });
  await boton.scrollIntoViewIfNeeded();
  await boton.click({ force: true });
});

When("escribe el código que le llegó por correo", async ({ page, request, estado }) => {
  const v = estado.visitanteUi as { email: string; lang: "es" | "en" };
  const campo = page.getByLabel(v.lang === "es" ? "Código" : "Code");
  await expect(campo).toBeVisible({ timeout: 30_000 });
  await campo.fill(await codigo(request, v.email));
  const boton = page.getByRole("button", { name: v.lang === "es" ? "Confirmar reserva" : "Confirm booking" });
  await boton.scrollIntoViewIfNeeded();
  await boton.click({ force: true });
});

When("continúa con Google", async ({ page }) => {
  await page.getByRole("button", { name: /Continuar con Google|Continue with Google/ }).click();
});

Then("ve «{}»", async ({ page }, texto: string) => {
  await expect(page.getByText(texto, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
});

When("{string} entra a «Mis citas» con un código", async ({ page, request, estado }, nombre: string) => {
  const v = (estado.visitantes as Record<string, { email: string }>)[nombre];
  if (!v) throw new Error(`Visitante desconocida: ${nombre}`);
  await page.goto(`${sitio.es}/citas`);
  await page.getByLabel("Correo").fill(v.email);
  const desde = Date.now() - 1_000;
  await page.getByRole("button", { name: "Enviar código" }).click();
  await expect(page.getByLabel("Código")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Código").fill(await codigo(request, v.email, desde));
  await page.getByRole("button", { name: "Entrar" }).click();
});

Then("ve {int} cita en la lista", async ({ page }, n: number) => {
  await expect(page.getByRole("button", { name: "Cancelar" })).toHaveCount(n, { timeout: 15_000 });
});

When("cancela la cita desde la lista", async ({ page }) => {
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Cancelar" }).first().click();
});

// ── Embed ──

When(
  "una web ajena inserta el tablero con embed.js en modo {string}",
  async ({ page, estado }, modo: string) => {
    // Web anfitriona servida por un servidor local real (otro origen, como la landing de un negocio).
    const html = `<!doctype html><html lang="es"><head><title>Web del negocio</title></head><body><h1>Web del negocio</h1><script src="${sitio.es}/embed.js" data-calendar="${tablero(estado).slug}" data-mode="${modo}"></script></body></html>`;
    const server = createServer((_req, res) => res.writeHead(200, { "content-type": "text/html" }).end(html));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    page.on("close", () => server.close());
    await page.goto(`http://127.0.0.1:${port}/`);
  },
);

Then("el iframe muestra el tablero {string}", async ({ page }, nombre: string) => {
  const frame = page.frameLocator("iframe");
  await expect(frame.getByRole("heading", { name: nombre })).toBeVisible({ timeout: 20_000 });
});

Then("la página del embed permite insertarse en cualquier sitio", async ({ request, estado }) => {
  const res = await request.get(`${sitio.es}/embed/${tablero(estado).slug}`);
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors *");
  expect(res.headers()["x-frame-options"]).toBeUndefined();
});

// ── Capturas ──

async function capturar(
  page: Page,
  url: string,
  nombre: string,
  testInfo: { attach: (n: string, o: { body: Buffer; contentType: string }) => Promise<void> },
) {
  for (const ancho of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    await testInfo.attach(`${nombre}-${ancho}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  }
}

Then(
  "se guardan capturas de la reserva y del panel en 360, 768, 1024 y 1440 px",
  async ({ page, estado, $testInfo }) => {
    const a = actor(estado, String(estado.propietario));
    await capturar(page, `${sitio.es}/reservar/${tablero(estado).slug}`, "reserva", $testInfo);
    await iniciarEnNavegador(page.context(), a.api);
    await capturar(page, `${sitio.es}/panel/calendarios/${tablero(estado).id}`, "panel", $testInfo);
  },
);
