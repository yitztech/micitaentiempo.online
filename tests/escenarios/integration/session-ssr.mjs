import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chromium, request } from "@playwright/test";

const project = process.env.MCET_TEST_PROJECT;
if (!project || !["ci", "mcet-tests"].includes(project)) throw new Error("Invalid test project");
const compose = [
  "compose",
  "-f",
  "compose.prod.yml",
  "-f",
  "compose.ci.yml",
  "--env-file",
  ".env.ci",
  "-p",
  project,
];
const sql = (query) =>
  execFileSync("docker", [
    ...compose,
    "exec",
    "-T",
    "postgres",
    "sh",
    "-c",
    'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"',
    "sh",
    query,
  ]);
const base = "http://micitaentiempo.localhost:8080";
const password = "una-clave-bien-larga-2026";
const emails = [randomUUID(), randomUUID()].map((id) => `${id}@escenarios.test`);
const browser = await chromium.launch({ headless: true });
try {
  const contexts = [];
  for (const [index, email] of emails.entries()) {
    const api = await request.newContext({ baseURL: base, extraHTTPHeaders: { Origin: base } });
    const signup = await api.post("/api/auth/sign-up/email", {
      data: { name: index ? "Bea" : "Ana", email, password },
    });
    assert.equal(signup.status(), 200, await signup.text());
    sql(`UPDATE app.users SET email_verified=true WHERE email='${email}'`);
    const login = await api.post("/api/auth/sign-in/email", { data: { email, password } });
    assert.equal(login.status(), 200, await login.text());
    if (!index) {
      const org = await api.post("/api/v1/org", { data: { name: "Negocio de Ana", plan: "personal" } });
      assert.equal(org.status(), 201, await org.text());
      const calendar = await api.post("/api/v1/calendars", {
        data: { name: "Consultas", timezone: "America/Mexico_City", country: "MX" },
      });
      assert.equal(calendar.status(), 201, await calendar.text());
    }
    const context = await browser.newContext();
    await context.addCookies((await api.storageState()).cookies);
    await api.dispose();
    contexts.push(context);
  }
  sql(
    `UPDATE app.sessions SET expires_at=now()+interval '5 days' WHERE user_id IN (SELECT id FROM app.users WHERE email IN ('${emails[0]}','${emails[1]}'))`,
  );
  const page = await contexts[0].newPage();
  const response = await page.goto(`${base}/panel`);
  assert.equal(response.status(), 200);
  assert(
    (await response.headersArray()).some(
      (h) => h.name.toLowerCase() === "set-cookie" && /session_token/i.test(h.value),
    ),
  );
  await page.goto(`${base}/panel/facturacion`);
  assert.equal(new URL(page.url()).pathname, "/panel/facturacion");
  assert.equal(
    (await contexts[0].request.post(`${base}/api/auth/sign-out`, { headers: { Origin: base } })).status(),
    200,
  );
  await page.goto(`${base}/panel`);
  assert.equal(new URL(page.url()).pathname, "/entrar");
  const otherSession = await (await contexts[1].request.get(`${base}/api/auth/get-session`)).json();
  assert.equal(otherSession.user.email, emails[1]);
  const otherPage = await contexts[1].newPage();
  await otherPage.goto(`${base}/panel`);
  assert.equal(new URL(otherPage.url()).pathname, "/bienvenida");
  console.log("SSR session renewal, navigation, redirects and independent logout verified.");
} finally {
  await browser.close();
}
