import { expect } from "@playwright/test";
import { idioma, sitio, Then, When } from "../fixtures/sitio";

When(
  "se consulta {string} en el dominio {string}",
  async ({ request, estado }, ruta: string, dominio: string) => {
    const res = await request.get(`${sitio[idioma(dominio)]}${ruta}`, { maxRedirects: 0 });
    estado.status = res.status();
    estado.body = await res.text();
    estado.location = res.headers().location;
    estado.headers = res.headers();
    estado.dominio = dominio;
  },
);

Then("la respuesta tiene estado {int}", ({ estado }, codigo: number) => {
  expect(estado.status).toBe(codigo);
});

Then("la respuesta JSON tiene el campo {string}", ({ estado }, campo: string) => {
  const json = JSON.parse(String(estado.body)) as Record<string, unknown>;
  expect(json[campo], `campo ${campo}`).toBeTruthy();
});

Then("la respuesta contiene {string}", ({ estado }, texto: string) => {
  expect(String(estado.body)).toContain(texto);
});

When("se fija el reloj del sistema en {string}", async ({ request, estado }, iso: string) => {
  const res = await request.post(`${sitio.es}/api/__test/clock`, { data: { now: iso } });
  estado.status = res.status();
  estado.body = await res.text();
});

When("se fija el reloj del sistema en la hora real", async ({ request, estado }) => {
  const res = await request.post(`${sitio.es}/api/__test/clock`, { data: { now: null } });
  estado.status = res.status();
  estado.body = await res.text();
});

Then("la respuesta redirige a {string}", ({ estado }, destino: string) => {
  expect(estado.location).toBe(destino);
});

// ── Indexación (AGENTS.md §9.2) ──

Then("la respuesta lleva X-Robots-Tag noindex", ({ estado }) => {
  expect((estado.headers as Record<string, string>)["x-robots-tag"] ?? "").toMatch(/noindex/);
});

Then("robots.txt no lleva Disallow", ({ estado }) => {
  expect((estado.headers as Record<string, string>)["content-type"]).toMatch(/^text\/plain/);
  expect(String(estado.body)).not.toMatch(/^Disallow:\s*\S/im);
});

Then("cada URL del sitemap responde 200 sin noindex y con su canonical", async ({ request, estado }) => {
  const urls = [...String(estado.body).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? "");
  expect(urls.length).toBeGreaterThan(0);
  for (const url of urls) {
    const res = await request.get(url, { maxRedirects: 0 });
    expect(res.status(), url).toBe(200);
    expect(res.headers()["x-robots-tag"] ?? "", url).not.toMatch(/noindex/);
    const html = await res.text();
    expect(html, url).not.toMatch(/<meta name="robots" content="[^"]*noindex/);
    expect(html.match(/<link rel="canonical" href="([^"]*)"/)?.[1], url).toBe(url);
  }
});
