import { randomUUID } from "node:crypto";
import { pathFor } from "@mcet/i18n";
import { expect } from "@playwright/test";
import { actor } from "../fixtures/actores";
import { Given, sitio, Then, When } from "../fixtures/sitio";

function sample(value) {
  const length = /^texto de (\d+)$/.exec(value);
  if (length) return "Á".repeat(Number(length[1]));
  return (
    {
      vacío: "",
      espacios: "   ",
      control: "Ana\u0001Ruiz",
      bidi: "Ana\u202eRuiz",
      etiquetas: "<script>Ana</script>",
      internacional: "李 O’Connor López",
    }[value] ?? value
  );
}

When("intenta registrarse con el nombre de prueba {string}", async ({ request, estado }, value) => {
  const res = await request.post(`${sitio.es}/api/auth/sign-up/email`, {
    headers: { Origin: sitio.es },
    data: {
      name: sample(value),
      email: `validation-${randomUUID()}@escenarios.test`,
      password: "una-clave-bien-larga-2026",
    },
  });
  estado.status = res.status();
  estado.body = await res.text();
});

When("intenta guardar {string} con texto de longitud {int}", async ({ estado }, operation, length) => {
  const api = actor(estado, "Laura").api;
  const cal = estado.tablero;
  const name = "Á".repeat(length);
  const event = { kind: "block", start: "2026-09-15T16:00:00Z", end: "2026-09-15T16:30:00Z" };
  const operations = {
    perfil: ["PATCH", "/api/v1/me", { name }],
    negocio: ["PATCH", "/api/v1/org", { name }],
    tablero: ["PATCH", `/api/v1/calendars/${cal.id}`, { name }],
    servicio: ["POST", `/api/v1/calendars/${cal.id}/services`, { name: { es: name }, durationMin: 30 }],
    titulo: ["POST", `/api/v1/calendars/${cal.id}/events`, { ...event, title: name }],
    notas: ["POST", `/api/v1/calendars/${cal.id}/events`, { ...event, internalNotes: name }],
    asistente: [
      "POST",
      `/api/v1/calendars/${cal.id}/events`,
      { ...event, kind: "appointment", attendee: { name } },
    ],
    reserva: [
      "POST",
      `/api/public/v1/calendars/${cal.slug}/holds`,
      { serviceId: estado.servicio.id, start: event.start, attendee: { name, email: "ana@escenarios.test" } },
    ],
    contacto: [
      "POST",
      "/api/public/v1/contact",
      { name: "Ana", email: "ana@escenarios.test", message: name },
    ],
  };
  const [method, path, data] = operations[operation];
  const res = await api.fetch(path, { method, data, headers: { "Idempotency-Key": randomUUID() } });
  estado.status = res.status();
  estado.body = await res.text();
});

Given("el formulario de registro en {string}", async ({ page, estado }, lang) => {
  estado.formLang = lang;
  await page.goto(`${sitio[lang]}${pathFor("signUp", lang)}`);
  await expect(page.locator('input[name="name"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeEnabled();
});
When("escribe el nombre inválido y lo corrige", async ({ page }) => {
  const field = page.locator('input[name="name"]');
  await expect(field).toHaveAttribute("maxlength", "100");
  await field.fill("<script>Ana</script>");
  await expect(field).not.toHaveValue(/</);
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await field.fill("李 O’Connor López");
});
Then("el nombre es válido para enviar", async ({ page }) => {
  await expect
    .poll(() => page.locator('input[name="name"]').evaluate((input) => input.checkValidity()))
    .toBe(true);
});
When("completa un registro válido desde el navegador", async ({ page, estado }) => {
  const lang = estado.formLang;
  estado.registrationEmail = `browser-${randomUUID()}@escenarios.test`;
  await page.locator('input[name="name"]').fill("Ana López O’Connor");
  await page.locator('input[name="email"]').fill(estado.registrationEmail);
  await page.locator('input[name="password"]').fill("una-clave-bien-larga-2026");
  await page.locator('input[name="confirmPassword"]').fill("una-clave-bien-larga-2026");
  const response = page.waitForResponse(
    (res) => res.url().endsWith("/api/auth/sign-up/email") && res.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: lang === "es" ? "Crear cuenta" : "Create account", exact: true })
    .click();
  expect((await response).status()).toBe(200);
});
Then("ve la confirmación de envío al correo registrado", async ({ page, estado }) => {
  await expect(page.getByRole("status")).toContainText(estado.registrationEmail);
});
