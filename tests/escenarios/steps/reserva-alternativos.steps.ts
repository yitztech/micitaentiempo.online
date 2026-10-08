import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { Given, Then, When } from "../fixtures/sitio";

When("elige el servicio {string}", async ({ page }, nombreServicio: string) => {
  const btn = page.getByRole("button", { name: new RegExp(nombreServicio, "i") });
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
});

Then(
  "ve en el encabezado el servicio {string} de {int} minutos",
  async ({ page }, nombreServicio: string, minutos: number) => {
    await expect(page.getByRole("heading", { name: nombreServicio })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`${minutos} min`)).toBeVisible();
  },
);

When("solicita cambiar la hora de su cita", async ({ page }) => {
  const btn = page.getByRole("button", { name: /Cambiar hora|Reschedule/ }).first();
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
});

When("elige una nueva fecha y hora para reprogramar", async ({ page }) => {
  const dias = page.locator('section[aria-labelledby="titulo-dia"] button[aria-pressed]:not([disabled])');
  await expect(dias.first()).toBeVisible({ timeout: 15_000 });
  const count = await dias.count();
  if (count > 1) {
    await dias.nth(1).click();
  } else {
    await dias.first().click();
  }
  const hora = page.locator('[aria-labelledby="titulo-hora"] ul button').first();
  await expect(hora).toBeVisible({ timeout: 10_000 });
  await hora.click();
  const continuar = page.getByRole("button", { name: /Continuar con este horario|Continue with this time/ });
  await expect(continuar).toBeVisible({ timeout: 5_000 });
  await continuar.scrollIntoViewIfNeeded();
  await continuar.click({ force: true });
});

Then("ve el panel de revisión con el horario actual y el nuevo propuesto", async ({ page }) => {
  await expect(page.getByText(/Horario actual|Current schedule/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Nuevo horario propuesto|New proposed schedule/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByRole("button", { name: /Confirmar nuevo horario|Confirm new schedule/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Mantener horario actual|Keep current schedule/ }),
  ).toBeVisible();
});

When("confirma el nuevo horario", async ({ page }) => {
  const btn = page.getByRole("button", { name: /Confirmar nuevo horario|Confirm new schedule/ });
  await btn.scrollIntoViewIfNeeded();
  await btn.click({ force: true });
});

When("decide mantener el horario actual", async ({ page }) => {
  const btn = page.getByRole("button", { name: /Mantener horario actual|Keep current schedule/ });
  await btn.scrollIntoViewIfNeeded();
  await btn.click({ force: true });
});

Then("el panel de revisión ya no está visible", async ({ page }) => {
  await expect(page.getByText(/Nuevo horario propuesto|New proposed schedule/)).toBeHidden();
});

When("escribe un código incorrecto {string}", async ({ page }, codigoErroneo: string) => {
  const campo = page.getByLabel(/Código|Code/);
  await expect(campo).toBeVisible({ timeout: 30_000 });
  await campo.fill(codigoErroneo);
  const boton = page.getByRole("button", { name: /Confirmar reserva|Confirm booking/ });
  await boton.scrollIntoViewIfNeeded();
  await boton.click({ force: true });
});

When("falla la conexión al consultar los horarios", async ({ page }) => {
  await page.route("**/api/public/v1/calendars/*/availability*", (route) => route.abort());
});

When("se restaura la conexión", async ({ page }) => {
  await page.unroute("**/api/public/v1/calendars/*/availability*");
});

When("presiona el botón para reintentar la carga de horarios", async ({ page }) => {
  const btn = page.getByRole("button", { name: /Reintentar|Retry/ });
  await expect(btn).toBeVisible({ timeout: 10_000 });
  await btn.scrollIntoViewIfNeeded();
  await btn.click({ force: true });
});

Then("ve los días disponibles en el calendario", async ({ page }) => {
  await expect(page.locator("button[aria-pressed]:not([disabled])").first()).toBeVisible({ timeout: 15_000 });
});

Given(
  "un visitante nuevo {string} sin citas en el dominio {string}",
  ({ estado }, nombre: string, _dominio: string) => {
    estado.visitantes ??= {};
    (estado.visitantes as Record<string, { email: string }>)[nombre] = {
      email: `${nombre.toLowerCase()}-${randomUUID().slice(0, 8)}@escenarios.test`,
    };
  },
);

Then("ve que no tiene citas próximas", async ({ page }) => {
  await expect(page.getByText(/No tienes citas próximas|No upcoming appointments/)).toBeVisible({
    timeout: 15_000,
  });
});
