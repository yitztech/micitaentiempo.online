import { defineConfig, devices } from "@playwright/test";
import { cucumberReporter, defineBddConfig } from "playwright-bdd";

// Pruebas por escenarios (docs/plan/09-pruebas.md §9.2): Gherkin en español sobre
// compose.prod.yml + compose.ci.yml. Dominios locales: *.localhost.
const testDir = defineBddConfig({
  features: "features/**/*.feature",
  steps: ["steps/**/*.ts", "fixtures/**/*.ts"],
  language: "es",
});

// La segunda pasada (INFORME=reloj) deja sus informes aparte para no pisar los de la primera.
const suffix = process.env.INFORME ? `-${process.env.INFORME}` : "";

export default defineConfig({
  testDir,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: `playwright-report${suffix}` }],
    cucumberReporter("html", { outputFile: `cucumber-report${suffix}/index.html` }),
  ],
  use: {
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"] }, grepInvert: /@reloj/ },
    { name: "movil", use: { ...devices["Pixel 8"] }, grep: /@movil|@humo/, grepInvert: /@reloj/ },
    { name: "tableta", use: { ...devices["iPad Pro 11"] }, grep: /@tableta/, grepInvert: /@reloj/ },
    // El reloj del motor es uno para todo el entorno: quien lo mueve corre solo, en una segunda
    // pasada (correr.sh). No se usa `dependencies` porque las dependencias ignoran --grep.
    { name: "reloj", use: { ...devices["Desktop Chrome"] }, grep: /@reloj/, workers: 1 },
  ],
});
