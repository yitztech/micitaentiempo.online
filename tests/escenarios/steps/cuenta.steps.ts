import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { actor } from "../fixtures/actores";
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
