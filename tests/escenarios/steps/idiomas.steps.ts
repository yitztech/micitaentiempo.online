import { expect } from "@playwright/test";
import { idioma, sitio, Then, When } from "../fixtures/sitio";

When(
  "un visitante abre la página {string} del dominio {string}",
  async ({ page, estado }, ruta: string, dominio: string) => {
    const url = `${sitio[idioma(dominio)]}${ruta}`;
    const res = await page.goto(url);
    estado.redirigido = res?.request().redirectedFrom() != null || page.url() !== url;
  },
);

When(
  "un visitante con el navegador en inglés abre la página {string} del dominio {string}",
  async ({ browser, estado }, ruta: string, dominio: string) => {
    const context = await browser.newContext({
      locale: "en-US",
      extraHTTPHeaders: { "Accept-Language": "en-US,en" },
    });
    const page = await context.newPage();
    await page.goto(`${sitio[idioma(dominio)]}${ruta}`);
    estado.lang = await page.locator("html").getAttribute("lang");
    await context.close();
  },
);

Then("el documento tiene lang={string}", async ({ page, estado }, lang: string) => {
  const actual = (estado.lang as string | undefined) ?? (await page.locator("html").getAttribute("lang"));
  expect(actual).toBe(lang);
});

Then(
  "el canonical apunta a {string} en el dominio {string}",
  async ({ page }, ruta: string, dominio: string) => {
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${sitio[idioma(dominio)]}${ruta}`,
    );
  },
);

Then(
  "enlaza con hreflang {string} a {string} en el dominio {string}",
  async ({ page }, lang: string, ruta: string, dominio: string) => {
    await expect(page.locator(`link[rel="alternate"][hreflang="${lang}"]`)).toHaveAttribute(
      "href",
      `${sitio[idioma(dominio)]}${ruta}`,
    );
  },
);

Then("hay un enlace x-default al dominio {string}", async ({ page }, dominio: string) => {
  const href = await page.locator('link[rel="alternate"][hreflang="x-default"]').getAttribute("href");
  expect(href?.startsWith(sitio[idioma(dominio)])).toBe(true);
});

Then("no hubo redirección automática", ({ estado }) => {
  expect(estado.redirigido).toBe(false);
});
