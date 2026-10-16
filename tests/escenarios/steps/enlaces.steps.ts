import { expect, type Page } from "@playwright/test";
import { idioma, sitio, Then, When } from "../fixtures/sitio";

async function abrirMenuSiHaceFalta(page: Page) {
  // Al cambiar de dominio, el HTML puede aparecer antes que el CSS: `isVisible()` aún no
  // distingue la cabecera de escritorio de la móvil. Esperar `load` incluye la hoja de estilos.
  await page.waitForLoadState("load");
  const menu = page.locator('header button[aria-controls="menu-movil"]');
  if (await menu.isVisible()) {
    // Las navegaciones internas cierran el menú en un efecto de React. Esperar ese cierre evita
    // pulsar el botón mientras todavía conserva el estado de la página anterior.
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
  }
}

Then("todos los enlaces de la página son válidos y responden con éxito", async ({ page, request }) => {
  await page.waitForLoadState("domcontentloaded");
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((anchors: HTMLAnchorElement[]) =>
      anchors.map((a) => a.getAttribute("href") ?? "").filter(Boolean),
    );

  expect(hrefs.length).toBeGreaterThan(0);
  const unicos = [...new Set(hrefs)];
  const fallos: Array<{ href: string; problema: string }> = [];

  for (const href of unicos) {
    if (href.startsWith("#")) {
      const id = href.slice(1);
      const existe = await page.evaluate((targetId) => {
        return Boolean(document.getElementById(targetId) || document.querySelector(`[name="${targetId}"]`));
      }, id);
      if (!existe) {
        fallos.push({ href, problema: `Ancla #${id} no encontrada en el documento` });
      }
      continue;
    }

    if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
      continue;
    }

    const url = new URL(href, page.url()).href;

    try {
      const res = await request.get(url, { maxRedirects: 5 });
      if (res.status() >= 400) {
        fallos.push({ href, problema: `HTTP ${res.status()} al consultar ${url}` });
      }
    } catch (err) {
      fallos.push({ href, problema: `Fallo de red en ${url}: ${String(err)}` });
    }
  }

  expect(fallos, `Enlaces rotos detectados: ${JSON.stringify(fallos, null, 2)}`).toEqual([]);
});

When("hace clic en el enlace {string} de la cabecera", async ({ page }, texto: string) => {
  await abrirMenuSiHaceFalta(page);
  const enlace = page.locator("header").getByRole("link", { name: texto }).first();
  await expect(enlace).toBeVisible({ timeout: 10_000 });
  await enlace.click();
});

When("hace clic en el enlace {string} del pie de página", async ({ page }, texto: string) => {
  const enlace = page.locator("footer").getByRole("link", { name: texto }).first();
  await enlace.scrollIntoViewIfNeeded();
  await expect(enlace).toBeVisible({ timeout: 10_000 });
  await enlace.click();
});

When("hace clic en el logo de la cabecera", async ({ page }) => {
  const logo = page
    .locator("header")
    .getByRole("link", { name: /Mi Cita en Tiempo|My Appointment On Time/ })
    .first();
  await expect(logo).toBeVisible({ timeout: 10_000 });
  await logo.click();
});

When("cambia de idioma usando el enlace de idioma de la cabecera", async ({ page }) => {
  await abrirMenuSiHaceFalta(page);
  const selectorBtn = page.locator("header button[aria-haspopup='true']:visible").first();
  if (await selectorBtn.isVisible()) {
    await selectorBtn.click();
    const otroIdioma = page.url().includes("myappointmentontime") || page.url().includes("/en") ? "es" : "en";
    const opcion = page.locator(`header a[hreflang='${otroIdioma}']:visible`).first();
    await expect(opcion).toBeVisible({ timeout: 10_000 });
    const destino = await opcion.getAttribute("href");
    expect(destino).toBeTruthy();
    await opcion.click();
    if (destino) {
      if (destino.startsWith("http://") || destino.startsWith("https://")) {
        await expect(page).toHaveURL(destino);
      } else {
        await expect(page).toHaveURL((url) => url.pathname === destino);
      }
    }
    await page.waitForLoadState("load");
    return;
  }
  const enlace = page.locator("header a[hreflang]:visible").first();
  await expect(enlace).toBeVisible({ timeout: 10_000 });
  const destino = await enlace.getAttribute("href");
  expect(destino).toBeTruthy();
  await enlace.click();
  await expect(page).toHaveURL(destino as string);
  await page.waitForLoadState("load");
});

When("cambia al idioma {string} usando el selector de idioma", async ({ page }, targetLang: string) => {
  await abrirMenuSiHaceFalta(page);
  const selectorBtn = page.locator("header button[aria-haspopup='true']:visible").first();
  await expect(selectorBtn).toBeVisible({ timeout: 10_000 });
  await selectorBtn.click();
  const opcion = page.locator(`header a[hreflang='${targetLang}']:visible`).first();
  await expect(opcion).toBeVisible({ timeout: 10_000 });
  const destino = await opcion.getAttribute("href");
  expect(destino).toBeTruthy();
  await opcion.click();
  if (destino) {
    if (destino.startsWith("http://") || destino.startsWith("https://")) {
      await expect(page).toHaveURL(destino);
    } else {
      await expect(page).toHaveURL((url) => url.pathname === destino);
    }
  }
  await page.waitForLoadState("load");
});

Then("la página actual tiene la ruta {string}", async ({ page }, ruta: string) => {
  await expect(page).toHaveURL((url) => url.pathname === ruta, { timeout: 15_000 });
});

Then("la página actual está en el dominio {string}", async ({ page }, dominio: string) => {
  const origen = new URL(sitio[idioma(dominio)]).origin;
  await expect(page).toHaveURL((url) => url.origin === origen, { timeout: 15_000 });
});

Then("el documento legal tiene el título {string} y contenido", async ({ page }, titulo: string) => {
  await expect(page.getByRole("heading", { level: 1, name: titulo, exact: true })).toBeVisible();
  await expect(page.locator(".prose-legal p").first()).toBeVisible();
});

Then("no aparece el enlace {string} en la cabecera", async ({ page }, texto: string) => {
  await abrirMenuSiHaceFalta(page);
  const enlace = page.locator("header").getByRole("link", { name: texto });
  await expect(enlace).toHaveCount(0);
});
