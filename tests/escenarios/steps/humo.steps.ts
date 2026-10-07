import { expect } from "@playwright/test";
import { type Idioma, sitio, Then } from "../fixtures/sitio";

const base = (d: string) => sitio[d as Idioma];

Then(
  "{string} y {string} del dominio {string} sirven la misma revisión",
  async ({ request }, version: string, salud: string, dominio: string) => {
    const v = (await (await request.get(`${base(dominio)}${version}`)).json()) as { revision: string };
    const h = (await (await request.get(`${base(dominio)}${salud}`)).json()) as {
      status: string;
      revision: string;
    };
    expect(h.status).toBe("ok");
    expect(h.revision).toBe(v.revision);
    if (process.env.EXPECTED_SHA) expect(v.revision).toBe(process.env.EXPECTED_SHA);
  },
);

Then(
  "la página de inicio del dominio {string} responde con las cabeceras de seguridad",
  async ({ request }, dominio: string) => {
    const res = await request.get(`${base(dominio)}/`);
    expect(res.status()).toBe(200);
    const h = res.headers();
    expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
    expect(h["cross-origin-resource-policy"]).toBe("same-origin");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    if (base(dominio).startsWith("https://")) expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h.server ?? "").not.toMatch(/\d/);
  },
);

Then(
  "{string} y {string} del dominio {string} responden",
  async ({ request }, robots: string, sitemap: string, dominio: string) => {
    expect((await request.get(`${base(dominio)}${robots}`)).status()).toBe(200);
    const map = await request.get(`${base(dominio)}${sitemap}`);
    expect(map.status()).toBe(200);
    expect(await map.text()).toContain(base(dominio));
  },
);

Then(
  "el descubrimiento MCP del dominio {string} apunta a su propio emisor",
  async ({ request }, dominio: string) => {
    const prm = (await (
      await request.get(`${base(dominio)}/.well-known/oauth-protected-resource/mcp`)
    ).json()) as {
      resource: string;
      authorization_servers: string[];
    };
    expect(prm.resource).toBe(`${base(dominio)}/mcp`);
    expect(prm.authorization_servers).toEqual([`${base(dominio)}/api/auth`]);
  },
);
