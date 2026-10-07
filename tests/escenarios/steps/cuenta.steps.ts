import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";
import { actor, CLAVE } from "../fixtures/actores";
import { sitio, Then, When } from "../fixtures/sitio";

When("{string} abre su cuenta", async ({ page, estado }, nombre: string) => {
  const a = actor(estado, nombre);
  await page.context().addCookies((await a.api.storageState()).cookies);
  await page.goto(`${sitio[a.dominio]}${a.dominio === "es" ? "/panel/cuenta" : "/dashboard/account"}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

When("cambia su nombre a {string}", async ({ page }, nuevo: string) => {
  await page.getByLabel("Nombre", { exact: true }).fill(nuevo);
  await page.getByRole("button", { name: "Guardar" }).click();
});

When("exporta sus datos", async ({ page, estado }) => {
  const descarga = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar mis datos" }).click();
  estado.descarga = await (await descarga).path();
});

Then("el archivo descargado incluye {string}", async ({ estado }, texto: string) => {
  expect(await readFile(String(estado.descarga), "utf8")).toContain(texto);
});

When("borra su cuenta escribiendo {string}", async ({ page }, palabra: string) => {
  await page.getByRole("button", { name: "Borrar mi cuenta" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel(palabra).fill(palabra);
  await dialogo.getByRole("button", { name: "Borrar mi cuenta" }).click();
});

Then("la sesión de {string} ya no es válida", async ({ page, estado }, nombre: string) => {
  await expect(page).toHaveURL(/\/$/);
  const res = await actor(estado, nombre).api.get("/api/v1/me");
  expect(res.status()).toBe(401);
});

/** TOTP (RFC 6238, SHA-1, 30 s, 6 cifras) a partir de la clave en base32 que muestra la página. */
function totp(secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)?.map((b) => Number.parseInt(b, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = (h[h.length - 1] ?? 0) & 0xf;
  const n = (h.readUInt32BE(o) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, "0");
}

When("activa la verificación en dos pasos", async ({ page, estado }) => {
  await page.getByRole("button", { name: "Activar", exact: true }).click();
  await page.getByLabel("Confirma tu contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Activar", exact: true }).click();
  const clave = (await page.locator("code").first().textContent())?.trim() ?? "";
  expect(clave).toMatch(/^[A-Z2-7]+=*$/);
  estado.totp = clave;
  await page.getByLabel("Código de 6 dígitos de la app").fill(totp(clave));
  await page.getByRole("button", { name: "Confirmar y activar" }).click();
});

Then("ve sus códigos de respaldo", async ({ page, estado }) => {
  const lista = page.getByRole("list", { name: /Códigos de respaldo/ });
  await expect(lista.getByRole("listitem")).not.toHaveCount(0);
  estado.respaldo = (await lista.getByRole("listitem").first().textContent())?.trim();
});

When("{string} entra en el navegador con su contraseña", async ({ browser, estado }, nombre: string) => {
  const a = actor(estado, nombre);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${sitio[a.dominio]}${a.dominio === "es" ? "/entrar" : "/sign-in"}`);
  await page.getByLabel("Correo").fill(a.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(CLAVE);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  estado.pagina2fa = page;
});

Then("se le pide el código de dos pasos", async ({ estado }) => {
  const page = estado.pagina2fa as Page;
  await expect(page.getByRole("heading", { name: "Verificación en dos pasos" })).toBeVisible();
});

When("escribe el código de su app de autenticación", async ({ estado }) => {
  const page = estado.pagina2fa as Page;
  await page.getByLabel("Código", { exact: true }).fill(totp(String(estado.totp)));
  await page.getByRole("button", { name: "Verificar" }).click();
});

When("usa un código de respaldo", async ({ estado }) => {
  const page = estado.pagina2fa as Page;
  await page.getByRole("button", { name: "Usar un código de respaldo" }).click();
  await page.getByLabel("Código de respaldo").fill(String(estado.respaldo));
  await page.getByRole("button", { name: "Verificar" }).click();
});

Then("está en su panel", async ({ estado }) => {
  const page = estado.pagina2fa as Page;
  await expect(page).toHaveURL(/\/(panel|bienvenida|dashboard|welcome)/, { timeout: 15_000 });
  await page.context().close();
});

When("cierra su negocio escribiendo su nombre", async ({ page, estado }) => {
  const nombre = `Negocio de ${String(estado.propietario)}`;
  await page.getByRole("button", { name: "Cerrar el negocio" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Nombre del negocio").fill(nombre);
  await dialogo.getByRole("button", { name: "Cerrar el negocio" }).click();
});

Then("la página pública del tablero ya no existe", async ({ request, estado }) => {
  const slug = (estado.tablero as { slug: string }).slug;
  const res = await request.get(`${sitio.es}/api/public/v1/calendars/${slug}`);
  expect(res.status()).toBe(404);
});
