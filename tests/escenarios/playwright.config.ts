import { defineConfig, devices } from "@playwright/test";
import { cucumberReporter, defineBddConfig } from "playwright-bdd";

// Pruebas por escenarios (docs/plan/09-pruebas.md §9.2): Gherkin en español sobre
// compose.prod.yml + compose.ci.yml. Dominios locales: *.localhost.
const testDir = defineBddConfig({
  features: "features/**/*.feature",
  steps: ["steps/**/*.ts", "fixtures/**/*.ts"],
  language: "es",
});

export default defineConfig({
  testDir,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    cucumberReporter("html", { outputFile: "cucumber-report/index.html" }),
  ],
  use: {
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"] } },
    { name: "movil", use: { ...devices["Pixel 8"] }, grep: /@movil|@humo/ },
    { name: "tableta", use: { ...devices["iPad Pro 11"] }, grep: /@tableta/ },
  ],
});
