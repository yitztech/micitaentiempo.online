import { defineConfig, devices } from "@playwright/test";
import { cucumberReporter, defineBddConfig } from "playwright-bdd";

// Pruebas por escenarios (docs/plan/09-pruebas.md §9.2): Gherkin en español sobre
// compose.prod.yml + compose.ci.yml. Dominios locales: *.localhost.
const testDir = defineBddConfig({
  features: "features/**/*.feature",
  steps: ["steps/**/*.{ts,js}", "fixtures/**/*.ts"],
  language: "es",
});

// La segunda pasada (INFORME=reloj) deja sus informes aparte para no pisar los de la primera.
const suffix = process.env.INFORME ? `-${process.env.INFORME}` : "";

export default defineConfig({
  testDir,
  fullyParallel: true,
  outputDir: `test-results${suffix}`,
  workers: 4,
  // Los escenarios de interfaz resuelven ALTCHA y esperan correos: más margen que el predeterminado.
  timeout: 90_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["json", { outputFile: `test-results${suffix}/results.json` }],
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
    { name: "backend", use: { ...devices["Desktop Chrome"] }, grep: /@backend/, grepInvert: /@reloj/ },
    { name: "frontend", use: { ...devices["Desktop Chrome"] }, grep: /@frontend/, grepInvert: /@reloj/ },
    { name: "android", use: { ...devices["Pixel 8"] }, grep: /@frontend/, grepInvert: /@reloj/ },
    { name: "ios", use: { ...devices["iPhone 13"] }, grep: /@frontend/, grepInvert: /@reloj/ },
    {
      name: "android-tablet",
      use: { ...devices["Galaxy Tab S9"], viewport: { width: 800, height: 1280 } },
      grep: /@frontend/,
      grepInvert: /@reloj/,
    },
    { name: "ios-tablet", use: { ...devices["iPad Pro 11"] }, grep: /@frontend/, grepInvert: /@reloj/ },
    // El reloj del motor es uno para todo el entorno: quien lo mueve corre solo, en una segunda
    // pasada (correr.sh). No se usa `dependencies` porque las dependencias ignoran --grep.
    { name: "reloj", use: { ...devices["Desktop Chrome"] }, grep: /@reloj/, workers: 1 },
  ],
});
