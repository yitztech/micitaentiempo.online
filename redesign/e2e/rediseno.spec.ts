import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publicas = [
  "/",
  "/directorio",
  "/funciones",
  "/precios",
  "/ingresar",
  "/registro",
  "/recuperar",
  "/restablecer",
];
const panel = [
  "/panel",
  "/panel/calendario",
  "/panel/clientes",
  "/panel/avisos",
  "/panel/preferencias-avisos",
  "/panel/negocio",
  "/panel/facturacion",
  "/panel/ia",
  "/panel/cuenta",
];

for (const ruta of [...publicas, ...panel]) {
  test(`accesibilidad WCAG AA sin violaciones: ${ruta}`, async ({ page }) => {
    await page.goto(ruta);
    await page.waitForLoadState("networkidle");
    const r = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      r.violations.map(
        (v) =>
          `${v.id}: ${v.nodes
            .map((n) => n.target.join(" "))
            .slice(0, 3)
            .join(" | ")}`,
      ),
    ).toEqual([]);
  });
}

for (const [w, h] of [
  [375, 812],
  [768, 1024],
  [1024, 768],
  [1440, 900],
  [1920, 1080],
] as const) {
  test(`sin desbordamiento horizontal a ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    for (const ruta of [...publicas, ...panel]) {
      await page.goto(ruta);
      await page.waitForLoadState("networkidle");
      const { sw, iw } = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
      }));
      expect(sw, ruta).toBeLessThanOrEqual(iw);
    }
  });
}

test("el hero muestra titular, CTA y navegación a registro", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tus clientes reservan.");
  await page.getByRole("link", { name: "Empieza gratis" }).first().click();
  await expect(page).toHaveURL(/\/registro$/);
  await expect(page.getByRole("heading", { name: "Crea tu cuenta" })).toBeVisible();
});

test("calendario del hero: seleccionar día y cambiar de mes", async ({ page }) => {
  await page.goto("/");
  const cal = page.getByRole("region", { name: /Octubre 2026/ });
  await cal.getByRole("button", { name: /^13 de octubre/ }).click();
  await expect(cal.getByRole("button", { name: /^13 de octubre/ })).toHaveAttribute("aria-pressed", "true");
  await cal.getByRole("button", { name: "Mes siguiente" }).click();
  await expect(page.getByText("Noviembre 2026").first()).toBeVisible();
});

test("preguntas frecuentes: acordeón accesible", async ({ page }) => {
  await page.goto("/");
  const b = page.getByRole("button", { name: "¿Cuánto tarda la configuración?" });
  await expect(b).toHaveAttribute("aria-expanded", "false");
  await b.click();
  await expect(b).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Se configura en minutos")).toBeVisible();
});

test("directorio: búsqueda, categoría, localidad y estado vacío", async ({ page }) => {
  await page.goto("/directorio");
  await expect(page.getByText("8 resultados")).toBeVisible();
  await page.getByRole("button", { name: "Veterinarias" }).click();
  await expect(page.getByText("1 resultado", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Todas", exact: true }).click();
  await expect(page.getByRole("button", { name: "Todas", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByLabel("Localidad").selectOption("Monterrey");
  await expect(page.getByText("2 resultados")).toBeVisible();
  await page.getByLabel("Buscar por nombre o servicio").fill("zzzz");
  await expect(page.getByRole("heading", { name: "No encontramos resultados" })).toBeVisible();
  await page.getByRole("button", { name: "Quitar filtros" }).click();
  await expect(page.getByText("8 resultados")).toBeVisible();
});

test("login: valida campos, muestra errores y entra al panel", async ({ page }) => {
  await page.goto("/ingresar");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByText("Escribe tu correo.")).toBeVisible();
  await expect(page.getByLabel("Correo electrónico")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Correo electrónico").fill("laura@correo.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("clave-segura-1");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/panel$/);
  await expect(page.getByRole("heading", { name: "Hola, Laura" })).toBeVisible();
});

test("recuperación y restablecimiento de contraseña", async ({ page }) => {
  await page.goto("/recuperar");
  await page.getByLabel("Correo electrónico").fill("no-es-correo");
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByText("Escribe un correo válido.")).toBeVisible();
  await page.getByLabel("Correo electrónico").fill("laura@correo.com");
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByRole("heading", { name: "Revisa tu correo" })).toBeVisible();
  await page.goto("/restablecer");
  await page.getByLabel("Nueva contraseña").fill("clave-segura-1");
  await page.getByLabel("Confirma la contraseña").fill("otra-clave-2");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByText("Las contraseñas no coinciden.")).toBeVisible();
});

test("panel: navegación lateral y pestañas del calendario", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/panel");
  await page.getByRole("link", { name: "Calendario" }).first().click();
  await expect(page).toHaveURL(/\/panel\/calendario$/);
  await page.getByRole("button", { name: "Nueva cita" }).click();
  await expect(page.getByRole("dialog", { name: "Nueva cita" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/panel");
  await page.getByRole("button", { name: "Semana" }).click();
  await expect(page.getByRole("button", { name: "Semana" })).toHaveAttribute("aria-pressed", "true");
});

test("panel móvil: navegación inferior y menú «Más»", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/panel");
  const nav = page.getByRole("navigation", { name: "Navegación del panel" });
  await expect(nav).toBeVisible();
  await nav.getByRole("link", { name: /Clientes/ }).click();
  await expect(page).toHaveURL(/\/panel\/clientes$/);
  await nav.getByRole("button", { name: "Más" }).click();
  await page.getByRole("link", { name: "Facturación" }).click();
  await expect(page).toHaveURL(/\/panel\/facturacion$/);
});

test("clientes: filtro y estado vacío", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/panel/clientes");
  await page.getByLabel("Buscar clientes").fill("Carlos");
  await expect(page.getByRole("cell", { name: /Carlos Méndez/ })).toBeVisible();
  await page.getByLabel("Buscar clientes").fill("zzz");
  await expect(page.getByRole("heading", { name: "Sin resultados" })).toBeVisible();
});

test("preferencias de avisos: el interruptor cambia de estado", async ({ page }) => {
  await page.goto("/panel/preferencias-avisos");
  const sw = page.getByRole("switch", { name: "Resumen diario" });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
});

test("menú móvil público abre y navega", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("link", { name: "Precios" }).click();
  await expect(page).toHaveURL(/\/precios$/);
});

test("controles táctiles ≥ 44 px en móvil (botones del hero)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  for (const name of ["Empieza gratis", "Ver demo"]) {
    const box = await page.getByRole("link", { name }).first().boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test("movimiento reducido: sin animaciones largas", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:4174/");
  const d = await page.evaluate(
    () => getComputedStyle(document.querySelector("h1")?.parentElement ?? document.body).animationDuration,
  );
  expect(parseFloat(d)).toBeLessThan(0.01);
  await ctx.close();
});
