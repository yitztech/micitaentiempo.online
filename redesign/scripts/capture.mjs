/** Captura las páginas en 5 tamaños y detecta desbordamiento horizontal. Uso: node scripts/capture.mjs [baseUrl] [filtroRuta] */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const base = process.argv[2] ?? "http://localhost:4173";
const only = process.argv[3];
const sizes = [
  ["375x812", 375, 812],
  ["768x1024", 768, 1024],
  ["1024x768", 1024, 768],
  ["1440x900", 1440, 900],
  ["1920x1080", 1920, 1080],
];
const pages = [
  ["inicio", "/"],
  ["directorio", "/directorio"],
  ["funciones", "/funciones"],
  ["precios", "/precios"],
  ["ingresar", "/ingresar"],
  ["registro", "/registro"],
  ["recuperar", "/recuperar"],
  ["restablecer", "/restablecer"],
  ["panel", "/panel"],
  ["panel-calendario", "/panel/calendario"],
  ["panel-clientes", "/panel/clientes"],
  ["panel-avisos", "/panel/avisos"],
  ["panel-preferencias", "/panel/preferencias-avisos"],
  ["panel-negocio", "/panel/negocio"],
  ["panel-facturacion", "/panel/facturacion"],
  ["panel-ia", "/panel/ia"],
  ["panel-cuenta", "/panel/cuenta"],
].filter(([n]) => !only || n.includes(only));

mkdirSync("capturas", { recursive: true });
const browser = await chromium.launch();
let overflow = 0;
for (const [sn, w, h] of sizes) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    hasTouch: w < 768,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  page.on("pageerror", (e) => errs.push(String(e)));
  for (const [name, path] of pages) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    // recorre la página para disparar la carga diferida de imágenes
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(450);
    const ov = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }));
    if (ov.sw > ov.iw) {
      overflow++;
      console.log(`DESBORDE ${sn} ${path}: scrollWidth ${ov.sw} > ${ov.iw}`);
    }
    const png = await page.screenshot({ fullPage: true });
    await sharp(png).webp({ quality: 80 }).toFile(`capturas/${name}-${sn}.webp`);
  }
  if (errs.length) console.log(`ERRORES CONSOLA ${sn}:`, [...new Set(errs)].slice(0, 5));
  await ctx.close();
}
await browser.close();
console.log(`listo: ${pages.length * sizes.length} capturas, ${overflow} desbordes`);
