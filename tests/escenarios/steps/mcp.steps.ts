import { createHash, randomBytes } from "node:crypto";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { type APIRequestContext, expect } from "@playwright/test";
import { type Actor, actor, actores, CLAVE } from "../fixtures/actores";
import { esperarCorreo } from "../fixtures/correo";
import { type Idioma, sitio, Then, When } from "../fixtures/sitio";

/** Retorno loopback de la «aplicación de IA» de prueba (el mismo que publica su documento CIMD). */
const RETORNO = "http://127.0.0.1:33418/callback";

interface Conexion {
  dominio: Idioma;
  clientId: string;
  accessToken: string;
  refreshToken?: string;
  actor: string;
}

const conexion = (estado: Record<string, unknown>) => estado.mcp as Conexion;
/** Id de un tablero por su nombre, buscándolo entre los de todos los actores del escenario. */
async function tableroId(estado: Record<string, unknown>, nombre: string): Promise<string> {
  for (const a of Object.values(actores(estado))) {
    const res = await a.api.get("/api/v1/calendars");
    const found = ((await res.json()) as { id: string; name: string }[]).find((c) => c.name === nombre);
    if (found) return found.id;
  }
  throw new Error(`Tablero desconocido: ${nombre}`);
}

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

function authorizeUrl(dominio: Idioma, clientId: string, scope: string, challenge: string): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: RETORNO,
    scope,
    state: randomBytes(8).toString("hex"),
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: `${sitio[dominio]}/mcp`,
  });
  return `${sitio[dominio]}/api/auth/oauth2/authorize?${q}`;
}

async function canjear(
  api: APIRequestContext,
  dominio: Idioma,
  clientId: string,
  code: string,
  verifier: string,
) {
  const res = await api.post(`${sitio[dominio]}/api/auth/oauth2/token`, {
    form: {
      grant_type: "authorization_code",
      code,
      redirect_uri: RETORNO,
      client_id: clientId,
      code_verifier: verifier,
      resource: `${sitio[dominio]}/mcp`,
    },
  });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as { access_token: string; refresh_token?: string; scope: string };
}

async function mcp(estado: Record<string, unknown>, version?: "2026-07-28") {
  const c = conexion(estado);
  const transport = new StreamableHTTPClientTransport(new URL(`${sitio[c.dominio]}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${c.accessToken}` } },
  });
  const client = new Client(
    { name: "escenarios", version: "1.0.0" },
    version ? { versionNegotiation: { mode: { pin: version } } } : {},
  );
  await client.connect(transport);
  return client;
}

async function herramienta(
  estado: Record<string, unknown>,
  name: string,
  args: Record<string, unknown> = {},
) {
  const client = await mcp(estado);
  try {
    const res = await client.callTool({ name, arguments: args });
    estado.resultado = res;
    return res as {
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
      content: { text?: string }[];
    };
  } finally {
    await client.close();
  }
}

/** Flujo OAuth completo sin navegador: registro dinámico, autorización, tableros elegidos y token. */
async function conectarPorDcr(a: Actor, scope: string, calendarIds: string[] = []): Promise<Conexion> {
  const reg = await a.api.post(`${sitio[a.dominio]}/api/auth/oauth2/register`, {
    data: {
      client_name: "IA de escenarios",
      redirect_uris: [RETORNO],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
  });
  expect(reg.status(), await reg.text()).toBe(201);
  const { client_id: clientId } = (await reg.json()) as { client_id: string };
  const { verifier, challenge } = pkce();
  const auth = await a.api.get(authorizeUrl(a.dominio, clientId, `openid ${scope}`, challenge), {
    headers: { accept: "application/json" },
    maxRedirects: 0,
  });
  const { url } = (await auth.json()) as { url: string };
  const consentUrl = new URL(url, sitio[a.dominio]);
  const scopes = consentUrl.searchParams.get("scope")?.split(" ") ?? [];
  const grant = await a.api.put("/api/v1/ai/grants", { data: { clientId, calendarIds, scopes } });
  expect(grant.status(), await grant.text()).toBe(200);
  const consent = await a.api.post("/api/auth/oauth2/consent", {
    data: { accept: true, oauth_query: consentUrl.search.slice(1) },
  });
  expect(consent.status(), await consent.text()).toBe(200);
  const back = new URL(((await consent.json()) as { url: string }).url);
  const tok = await canjear(a.api, a.dominio, clientId, back.searchParams.get("code") ?? "", verifier);
  return {
    dominio: a.dominio,
    clientId,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    actor: a.nombre,
  };
}

When(
  "{string} conecta desde el navegador la aplicación {string} con permisos {string}",
  async ({ page, estado }, nombre: string, clientId: string, scope: string) => {
    const a = actor(estado, nombre);
    const { verifier, challenge } = pkce();
    let retorno = "";
    await page.route(`${RETORNO}**`, async (route) => {
      retorno = route.request().url();
      await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
    });
    await page.goto(authorizeUrl(a.dominio, clientId, `openid ${scope}`, challenge));
    await page.getByLabel("Correo").fill(a.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(CLAVE);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Asistente de prueba quiere acceder/ })).toBeVisible();
    await expect(page.getByText("Dominio verificado: asistente.example")).toBeVisible();
    await page.getByRole("button", { name: "Permitir" }).click();
    await expect.poll(() => retorno, { timeout: 15_000 }).toContain("code=");
    const back = new URL(retorno);
    expect(back.searchParams.get("iss")).toBe(`${sitio[a.dominio]}/api/auth`);
    const tok = await canjear(a.api, a.dominio, clientId, back.searchParams.get("code") ?? "", verifier);
    estado.mcp = {
      dominio: a.dominio,
      clientId,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      actor: nombre,
    } satisfies Conexion;
    estado.conectadoEn = Date.now() - 5_000;
  },
);

When(
  "{string} conecta una aplicación por registro dinámico con permisos {string}",
  async ({ estado }, nombre: string, scope: string) => {
    estado.mcp = await conectarPorDcr(actor(estado, nombre), scope);
  },
);

When(
  "{string} conecta una aplicación por registro dinámico con permisos {string} solo para el tablero {string}",
  async ({ estado }, nombre: string, scope: string, tablero: string) => {
    estado.mcp = await conectarPorDcr(actor(estado, nombre), scope, [await tableroId(estado, tablero)]);
  },
);

Then("la aplicación recibe un token para el recurso {string}", ({ estado }, recurso: string) => {
  const c = conexion(estado);
  const payload = JSON.parse(Buffer.from(c.accessToken.split(".")[1] ?? "", "base64url").toString()) as {
    aud: string | string[];
    exp: number;
    iat: number;
  };
  expect([payload.aud].flat()).toContain(`${sitio[c.dominio]}${recurso}`);
  expect(payload.exp - payload.iat).toBe(15 * 60);
  expect(c.refreshToken).toBeTruthy();
});

Then("la IA ve el tablero {string}", async ({ estado }, nombre: string) => {
  const res = await herramienta(estado, "list_calendars");
  expect(res.isError ?? false).toBe(false);
  const cals = (res.structuredContent?.calendars ?? []) as { name: string }[];
  expect(cals.map((c) => c.name)).toContain(nombre);
});

Then("la IA no ve ningún tablero", async ({ estado }) => {
  const res = await herramienta(estado, "list_calendars");
  expect(res.structuredContent?.calendars).toEqual([]);
});

Then("la IA encuentra huecos libres del servicio", async ({ estado }) => {
  const tablero = estado.tablero as { id: string };
  const servicio = estado.servicio as { id: string };
  const res = await herramienta(estado, "find_available_slots", {
    calendar_id: tablero.id,
    service_id: servicio.id,
  });
  expect(res.isError ?? false, JSON.stringify(res.content)).toBe(false);
  const slots = (res.structuredContent?.slots ?? []) as { start_local: string }[];
  expect(slots.length).toBeGreaterThan(0);
  expect(slots[0]?.start_local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

Then("la IA no puede leer los eventos del tablero {string}", async ({ estado }, nombre: string) => {
  const res = await herramienta(estado, "list_events", { calendar_id: await tableroId(estado, nombre) });
  expect(res.isError).toBe(true);
  expect(res.structuredContent).toBeUndefined();
});

When("la IA bloquea una hora del tablero dentro de {int} días", async ({ estado }, dias: number) => {
  const tablero = estado.tablero as { id: string };
  const inicio = new Date(Date.now() + dias * 86_400_000);
  inicio.setUTCHours(20, 0, 0, 0);
  await herramienta(estado, "block_time", {
    calendar_id: tablero.id,
    start: inicio.toISOString(),
    end: new Date(inicio.getTime() + 3_600_000).toISOString(),
    title: "Reunión de equipo",
  });
});

Then("el bloqueo queda hecho por {string}", ({ estado }, via: string) => {
  const res = estado.resultado as {
    isError?: boolean;
    structuredContent?: { event: { created_via: string; kind: string } };
  };
  expect(res.isError ?? false).toBe(false);
  expect(res.structuredContent?.event.kind).toBe("block");
  expect(res.structuredContent?.event.created_via).toBe(via);
});

Then("la IA recibe el error de permiso {string}", ({ estado }, scope: string) => {
  const res = estado.resultado as { isError?: boolean; _meta?: Record<string, string[]> };
  expect(res.isError).toBe(true);
  expect(res._meta?.["mcp/www_authenticate"]?.[0]).toContain(`scope="${scope}"`);
});

Then(
  "{string} recibe el correo de nueva aplicación conectada",
  async ({ request, estado }, nombre: string) => {
    const correo = await esperarCorreo(request, actor(estado, nombre).email, {
      asunto: /Nueva aplicación de IA conectada/,
      despuesDe: Number(estado.conectadoEn ?? 0),
    });
    expect(correo.text).toContain("asistente.example");
  },
);

Then("en Panel → IA aparece la aplicación {string}", async ({ page, estado }, app: string) => {
  const c = conexion(estado);
  await page.goto(`${sitio[c.dominio]}${c.dominio === "es" ? "/panel/ia" : "/dashboard/ai"}`);
  await expect(page.getByText(app, { exact: true })).toBeVisible();
});

When("{string} revoca la aplicación en Panel → IA", async ({ estado }, nombre: string) => {
  const res = await actor(estado, nombre).api.delete(
    `/api/v1/ai/connections/${encodeURIComponent(conexion(estado).clientId)}`,
  );
  expect(res.status(), await res.text()).toBe(204);
});

Then("\\/mcp rechaza el token con el desafío OAuth", async ({ request, estado }) => {
  const c = conexion(estado);
  const res = await request.post(`${sitio[c.dominio]}/mcp`, {
    headers: {
      authorization: `Bearer ${c.accessToken}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(res.status()).toBe(401);
  expect(res.headers()["www-authenticate"]).toContain("resource_metadata=");
});

Then(
  "una IA con el protocolo {string} ve el tablero {string}",
  async ({ estado }, version: string, nombre: string) => {
    expect(version).toBe("2026-07-28");
    const client = await mcp(estado, "2026-07-28");
    try {
      const res = (await client.callTool({ name: "list_calendars", arguments: {} })) as {
        structuredContent?: { calendars: { name: string }[] };
        content: { text?: string }[];
      };
      estado.resultado = res;
      expect(res.structuredContent?.calendars.map((c) => c.name)).toContain(nombre);
    } finally {
      await client.close();
    }
  },
);

Then("el resumen de la herramienta está en {string}", ({ estado }, lang: string) => {
  const res = estado.resultado as { content: { text?: string }[] };
  expect(res.content[0]?.text).toMatch(lang === "en" ? /accessible board/ : /tablero\(s\) accesible/);
});

Then("el refresh token da un token nuevo", async ({ request, estado }) => {
  const c = conexion(estado);
  const res = await request.post(`${sitio[c.dominio]}/api/auth/oauth2/token`, {
    form: {
      grant_type: "refresh_token",
      refresh_token: c.refreshToken ?? "",
      client_id: c.clientId,
      resource: `${sitio[c.dominio]}/mcp`,
    },
  });
  expect(res.status(), await res.text()).toBe(200);
  const tok = (await res.json()) as { access_token: string };
  expect(tok.access_token).not.toBe(c.accessToken);
  estado.mcp = { ...c, accessToken: tok.access_token };
  const again = await herramienta(estado, "whoami");
  expect(again.isError).toBe(true); // sin el permiso profile
});

When(
  "una IA llama a \\/mcp sin token en el dominio {string}",
  async ({ request, estado }, dominio: string) => {
    const res = await request.post(`${sitio[dominio as Idioma]}/mcp`, {
      headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    estado.status = res.status();
    estado.cabecera = res.headers()["www-authenticate"] ?? "";
    estado.dominio = dominio;
  },
);

Then("recibe {int} con {string}", ({ estado }, status: number, texto: string) => {
  expect(estado.status).toBe(status);
  expect(String(estado.cabecera)).toContain(texto);
});

Then(
  "los metadatos del recurso apuntan al emisor {string} y al recurso {string}",
  async ({ request, estado }, emisor: string, recurso: string) => {
    const base = sitio[estado.dominio as Idioma];
    const prm = (await (await request.get(`${base}/.well-known/oauth-protected-resource/mcp`)).json()) as {
      resource: string;
      authorization_servers: string[];
    };
    expect(prm.resource).toBe(`${base}${recurso}`);
    expect(prm.authorization_servers).toEqual([`${base}${emisor}`]);
    const as = (await (
      await request.get(`${base}/.well-known/oauth-authorization-server${emisor}`)
    ).json()) as {
      issuer: string;
      registration_endpoint: string;
      client_id_metadata_document_supported: boolean;
    };
    expect(as.issuer).toBe(`${base}${emisor}`);
    expect(as.registration_endpoint).toBeTruthy();
    expect(as.client_id_metadata_document_supported).toBe(true);
  },
);
