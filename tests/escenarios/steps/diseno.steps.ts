import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { esperarCorreo } from "../fixtures/correo";
import { Then, When } from "../fixtures/sitio";

Then("se verifica el reflujo en cuatro anchos y dos esquemas de color", async ({ page, $testInfo }) => {
  const url = page.url();
  const medidas = [];
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (url.includes("/calendars/") || url.includes("/calendarios/")) {
        await expect(page.locator(".board-calendar")).toBeVisible();
      }
      await page.evaluate(() => document.fonts.ready);
      const medida = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        contenido: document.documentElement.scrollWidth,
        fuera: [...document.querySelectorAll("main button, main input, main select, main textarea")]
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1);
          })
          .map((el) => el.textContent?.trim().slice(0, 100) || el.getAttribute("aria-label") || el.tagName),
      }));
      medidas.push({ url, colorScheme, width, ...medida });
      expect(medida.contenido, JSON.stringify(medidas)).toBeLessThanOrEqual(medida.viewport + 1);
      expect(medida.fuera, JSON.stringify(medidas)).toEqual([]);
      if (width === 320 || width === 1440) {
        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        const fallos = axe.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => ({ id: v.id, nodos: v.nodes.map((n) => n.target) }));
        expect(fallos, `${url} ${width} ${colorScheme}`).toEqual([]);
        await $testInfo.attach(`pantalla-${width}-${colorScheme}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      }
    }
  }
  await $testInfo.attach("reflujo", {
    body: Buffer.from(JSON.stringify(medidas, null, 2)),
    contentType: "application/json",
  });
});

Then(
  "el diálogo de nueva cita conserva el foco al abrir y cerrar con teclado",
  async ({ page, $testInfo }) => {
    const abrir = page.getByRole("button", { name: /Nueva cita|New appointment/ });
    await abrir.focus();
    await abrir.press("Enter");
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      expect(await dialogo.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await $testInfo.attach("dialogo-arbol-accesible", {
      body: Buffer.from(await dialogo.ariaSnapshot()),
      contentType: "text/plain",
    });
    await page.keyboard.press("Escape");
    await expect(dialogo).toBeHidden();
    await expect(abrir).toBeFocused();
  },
);

When("completa una reserva por código dentro del iframe", async ({ page, request, estado }) => {
  await page.evaluate(() => {
    window.addEventListener("micita:booking_confirmed", (event) => {
      document.body.dataset.reserva = JSON.stringify((event as CustomEvent).detail);
    });
  });
  const frame = page.frameLocator("iframe");
  const dia = frame
    .locator('section[aria-labelledby="titulo-dia"] button[aria-pressed]:not([disabled])')
    .first();
  await expect(dia).toBeVisible();
  await dia.click();
  await frame.locator('[aria-labelledby="titulo-hora"] ul button').first().click();
  await frame.getByRole("button", { name: "Continuar con este horario" }).click();
  const email = `embed-${randomUUID()}@escenarios.test`;
  estado.correoEmbed = email;
  await frame.getByLabel("Nombre completo").fill("Carla del iframe");
  await frame.getByLabel("Correo", { exact: true }).fill(email);
  await frame.getByRole("button", { name: "Apartar este horario" }).click();
  await expect(frame.getByLabel("Código")).toBeVisible({ timeout: 30_000 });
  const correo = await esperarCorreo(request, email, { asunto: /\d{6}/ });
  const codigo = correo.subject.match(/\d{6}/)?.[0];
  expect(codigo).toBeTruthy();
  await frame.getByLabel("Código").fill(codigo as string);
  await frame.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(frame.getByRole("heading", { name: "¡Cita confirmada!" })).toBeVisible();
});

Then(
  "la reserva embebida conserva la sesión, ajusta su altura y avisa al anfitrión",
  async ({ page, $testInfo }) => {
    const frame = page.frameLocator("iframe");
    await expect(page.locator("body")).toHaveAttribute("data-reserva", /"id":/);
    await expect(page.locator("iframe")).toHaveAttribute("style", /height: \d+px/);
    const documento = page.frames().find((f) => f.url().includes("/embed/"));
    expect(documento).toBeTruthy();
    const medida = await documento?.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      contenido: document.documentElement.scrollWidth,
    }));
    expect(medida?.contenido).toBeLessThanOrEqual((medida?.viewport ?? 0) + 1);
    await frame.getByRole("button", { name: "Ver mis citas", exact: true }).click();
    await expect(frame.getByText("Consulta general · Consultas", { exact: true })).toBeVisible();
    await expect(frame.getByRole("button", { name: "Cancelar", exact: true })).toBeVisible();
    await $testInfo.attach("embed-con-sesion", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  },
);

Then("el horario se elige con teclado y el foco avanza a los datos", async ({ page }) => {
  const dia = page
    .locator('section[aria-labelledby="titulo-dia"] button[aria-pressed]:not([disabled])')
    .first();
  await expect(dia).toBeVisible();
  await dia.focus();
  await dia.press("Enter");
  const hora = page.locator('[aria-labelledby="titulo-hora"] ul button').first();
  await hora.focus();
  await hora.press("Enter");
  const continuar = page.getByRole("button", { name: "Continuar con este horario" });
  await continuar.focus();
  await continuar.press("Enter");
  await expect(page.locator("#titulo-datos")).toBeFocused();
  await expect(page.getByLabel("Nombre completo")).toHaveAttribute("name", "name");
  await expect(page.getByLabel("Correo", { exact: true })).toHaveAttribute("name", "email");
});

Then("el foco y los anuncios de verificación son accesibles", async ({ page, $testInfo }) => {
  await expect(page.locator("#titulo-verificar")).toBeFocused();
  await expect(page.getByLabel("Código")).toBeVisible();
  await expect(page.getByLabel("Código")).toHaveAttribute("autocomplete", "one-time-code");
  // El contador cambia cada segundo; no debe estar en un área que el lector anuncie continuamente.
  const contador = page.locator("p").filter({ hasText: /Apartamos tu horario/ });
  await expect(contador).toHaveCount(1);
  expect(
    await contador.evaluate((el) => Boolean(el.closest('[aria-live], [role="status"], [role="alert"]'))),
  ).toBe(false);
  await $testInfo.attach("verificacion-arbol-accesible", {
    body: Buffer.from(await page.locator("main").ariaSnapshot()),
    contentType: "text/plain",
  });
});
