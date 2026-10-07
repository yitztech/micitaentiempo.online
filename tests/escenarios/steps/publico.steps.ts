import AxeBuilder from "@axe-core/playwright";
import { pathFor, type RouteId } from "@mcet/i18n";
import { expect } from "@playwright/test";
import { sitio, Then } from "../fixtures/sitio";

Then("la respuesta no contiene {string}", ({ estado }, texto: string) => {
  expect(String(estado.body)).not.toContain(texto);
});

Then("la página pide no indexarse", async ({ page }) => {
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

Then("axe no encuentra problemas graves ni críticos", async ({ page }) => {
  const res = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const graves = res.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(graves).toEqual([]);
});

const PUBLICAS: RouteId[] = [
  "home",
  "features",
  "pricing",
  "faq",
  "connectAi",
  "contact",
  "privacy",
  "terms",
  "credits",
];

/** Nombres propios que se escriben igual en los dos idiomas. */
const IGUALES = new Set(["Claude", "ChatGPT", "Gemini", "Personal", "Inter", "Lucide"]);

Then("las páginas públicas no repiten frases entre los dos idiomas", async ({ page }) => {
  const textos = async (url: string) => {
    await page.goto(url);
    const lineas = await page.locator("body").innerText();
    return new Set(
      lineas
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => (l.match(/\p{L}{2,}/gu) ?? []).length >= 2 && !IGUALES.has(l)),
    );
  };
  const repetidas: string[] = [];
  for (const id of PUBLICAS) {
    const es = await textos(`${sitio.es}${pathFor(id, "es")}`);
    const en = await textos(`${sitio.en}${pathFor(id, "en")}`);
    for (const l of es) if (en.has(l)) repetidas.push(`${id}: ${l}`);
  }
  expect(repetidas).toEqual([]);
});

Then("la página carga como mucho {int} KB de JavaScript comprimido", async ({ page }, kb: number) => {
  await page.waitForLoadState("networkidle");
  // encodedBodySize: tamaño comprimido de cada script, aunque venga de la caché.
  const total = await page.evaluate(() =>
    (
      performance.getEntriesByType("resource") as unknown as Array<{
        initiatorType: string;
        name: string;
        encodedBodySize: number;
      }>
    )
      .filter((e) => e.initiatorType === "script" || /\.js(\?|$)/.test(e.name))
      .reduce((n, e) => n + e.encodedBodySize, 0),
  );
  console.log(`JavaScript de ${page.url()}: ${Math.round(total / 1024)} KB`);
  expect(total).toBeGreaterThan(10_000);
  expect(Math.round(total / 1024), `${total} bytes`).toBeLessThanOrEqual(kb);
});
