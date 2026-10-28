import { expect } from "@playwright/test";
import { Then, When } from "../fixtures/sitio";

Then(
  "la cabecera ofrece una sola entrada {string} hacia {string}",
  async ({ page }, texto: string, acceso: string) => {
    const header = page.getByRole("banner");
    const mobileMenu = header.locator("#menu-movil");
    if ((await mobileMenu.isHidden()) && (await header.locator('[aria-controls="menu-movil"]').isVisible())) {
      await expect(async () => {
        if (await mobileMenu.isHidden()) await header.locator('[aria-controls="menu-movil"]').click();
        await expect(mobileMenu).toBeVisible({ timeout: 1000 });
      }).toPass();
    }
    const visibleLinks = header.locator(`a[href="${acceso}"]:visible`);
    await expect(visibleLinks).toHaveCount(1);
    await expect(visibleLinks).toHaveText(texto);
    await expect(
      header.locator(
        'a[href*="registro"], a[href*="sign-up"], a[href*="cadastro"], a[href*="registrieren"], a[href*="inscription"], a[href*="registrazione"]',
      ),
    ).toHaveCount(0);
  },
);

When("abre la entrada al negocio {string}", async ({ page }, texto: string) => {
  const link = page
    .getByRole("banner")
    .getByRole("link", { name: texto, exact: true })
    .filter({ visible: true });
  const href = await link.getAttribute("href");
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.locator('form input[name="email"]')).toBeVisible();
});

Then("puede crear una cuenta desde el acceso en {string}", async ({ page }, registro: string) => {
  await expect(page.locator('form input[name="email"]')).toBeVisible();
  await expect(page.locator(`main a[href="${registro}"]`).first()).toBeVisible();
});

Then("el formulario de acceso envía las credenciales sin solicitar CAPTCHA", async ({ page }) => {
  await page.waitForLoadState("networkidle");
  let challengeRequested = false;
  page.on("request", (request) => {
    if (request.url().includes("/api/public/v1/altcha")) challengeRequested = true;
  });
  let altchaHeader: string | undefined;
  await page.route("**/api/auth/sign-in/email", async (route) => {
    altchaHeader = route.request().headers()["x-altcha"];
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: "invalid_credentials" }),
    });
  });
  await page.getByLabel("Correo", { exact: true }).fill("persona@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("una-clave-bien-larga-2026");
  const login = page.waitForResponse((response) => response.url().includes("/api/auth/sign-in/email"));
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  expect((await login).status()).toBe(401);
  expect(altchaHeader).toBeUndefined();
  expect(challengeRequested).toBe(false);
});

Then("puede enviar el registro sin CAPTCHA y ver la confirmación de correo", async ({ page }) => {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main")).not.toContainText(/ALTCHA|No soy un robot|I'm not a robot/);
  const challenges: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/public/v1/altcha")) challenges.push(request.url());
  });
  let submissions = 0;
  await page.route("**/api/auth/sign-up/email", async (route) => {
    submissions++;
    expect(route.request().headers()["x-altcha"]).toBeUndefined();
    expect(route.request().postDataJSON()).not.toHaveProperty("confirmPassword");
    expect(route.request().postDataJSON()).toMatchObject({
      name: "Ana López",
      email: "ana@example.com",
      password: "una-clave-bien-larga-2026",
    });
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.locator('input[name="name"]').fill("Ana López");
  await page.locator('input[name="email"]').fill("ana@example.com");
  const password = page.locator('input[name="password"]');
  const confirmation = page.locator('input[name="confirmPassword"]');
  await password.fill("una-clave-bien-larga-2026");
  await confirmation.fill("otra-clave-bien-larga-2026");
  const passwordToggle = password.locator("..").locator("button");
  const confirmationToggle = confirmation.locator("..").locator("button");
  await passwordToggle.click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(confirmation).toHaveAttribute("type", "password");
  await confirmationToggle.click();
  await expect(confirmation).toHaveAttribute("type", "text");
  await passwordToggle.click();
  await confirmationToggle.click();
  await expect(password).toHaveAttribute("type", "password");
  await expect(confirmation).toHaveAttribute("type", "password");
  await page.locator('button[type="submit"]').click();
  await expect(confirmation).toHaveAttribute("aria-invalid", "true");
  const description = await confirmation.getAttribute("aria-describedby");
  expect(description).toBeTruthy();
  await expect(page.locator(`[id="${description}"]`)).not.toBeEmpty();
  expect(submissions).toBe(0);
  await expect(password).toHaveValue("una-clave-bien-larga-2026");
  await confirmation.fill("una-clave-bien-larga-2026");
  await expect(confirmation).not.toHaveAttribute("aria-invalid", "true");
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("status")).toContainText("ana@example.com");
  await expect(page.locator("form")).toHaveCount(0);
  expect(challenges).toEqual([]);
});

Then("puede solicitar recuperar su contraseña sin CAPTCHA", async ({ page }) => {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main")).not.toContainText(/ALTCHA|No soy un robot|I'm not a robot/);
  const challenges: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/public/v1/altcha")) challenges.push(request.url());
  });
  let requests = 0;
  await page.route("**/api/auth/request-password-reset", async (route) => {
    requests++;
    expect(route.request().headers()["x-altcha"]).toBeUndefined();
    expect(route.request().postDataJSON()).toMatchObject({ email: "ana@example.com" });
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.locator('input[name="email"]').fill("ana@example.com");
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(requests).toBe(1);
  expect(challenges).toEqual([]);
});
