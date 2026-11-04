import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JSONWebKeySet,
  type JWTPayload,
  SignJWT,
} from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createGoogleIdTokenVerifier } from "../src/public-booking/google-id-token.js";

const CLIENT = "configured-google-client";
const KID = "trusted-key";
const NOW = Math.floor(Date.now() / 1000);
const claims: JWTPayload = {
  iss: "https://accounts.google.com",
  aud: CLIENT,
  sub: "google-user-123",
  iat: NOW - 10,
  exp: NOW + 3600,
  email: "Ana@Gmail.com",
  email_verified: true,
  name: "Ana López",
};
const identity = { subject: "google-user-123", email: "ana@gmail.com", name: "Ana López" };
let trusted: Awaited<ReturnType<typeof generateKeyPair>>;
let attacker: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: JSONWebKeySet;

beforeAll(async () => {
  trusted = await generateKeyPair("RS256");
  attacker = await generateKeyPair("RS256");
  jwks = { keys: [{ ...(await exportJWK(trusted.publicKey)), kid: KID, alg: "RS256", use: "sig" }] };
});

beforeEach(() => {
  // Cualquier salida de red no declarada en una prueba falla; no se consulta Google.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network access")));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function sign(overrides: JWTPayload = {}, key = trusted.privateKey, header: Record<string, string> = {}) {
  return new SignJWT({ ...claims, ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: KID, ...header })
    .sign(key);
}

function localVerifier(clientId = CLIENT) {
  return createGoogleIdTokenVerifier(clientId, createLocalJWKSet(jwks));
}

describe("verificación criptográfica del ID token de Google (S01)", () => {
  it.each(["accounts.google.com", "https://accounts.google.com"])(
    "acepta un token firmado válido del emisor %s",
    async (iss) => {
      expect(await localVerifier()(await sign({ iss }))).toEqual(identity);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("rechaza una firma de otra clave aunque el kid sea el esperado", async () => {
    expect(await localVerifier()(await sign({}, attacker.privateKey))).toBeNull();
  });

  it("rechaza modificar el correo después de firmar", async () => {
    const [header, , signature] = (await sign()).split(".");
    const payload = Buffer.from(JSON.stringify({ ...claims, email: "victim@example.com" })).toString(
      "base64url",
    );
    expect(await localVerifier()(`${header}.${payload}.${signature}`)).toBeNull();
  });

  it("rechaza alg none y la reproducción con firma ficticia", async () => {
    const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    expect(await localVerifier()(`${header}.${payload}.`)).toBeNull();
    expect(await localVerifier()(`e30.${payload}.firma`)).toBeNull();
  });

  it("rechaza HS256 aunque su secreto se presente como una clave de confianza", async () => {
    const token = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).sign(new Uint8Array(32));
    expect(await localVerifier()(token)).toBeNull();
  });

  it.each([
    ["exp vencido", { exp: NOW - 1 }],
    ["exp exactamente ahora", { exp: NOW }],
    ["exp ausente", { exp: undefined }],
    ["exp de tipo incorrecto", { exp: "tomorrow" }],
    ["iat ausente", { iat: undefined }],
    ["iat futuro", { iat: NOW + 100 }],
    ["iat de tipo incorrecto", { iat: "yesterday" }],
    ["exp anterior a iat", { iat: NOW - 10, exp: NOW - 20 }],
    ["nbf futuro", { nbf: NOW + 100 }],
    ["audiencia ajena", { aud: "other-client" }],
    ["audiencia ausente", { aud: undefined }],
    ["audiencias múltiples", { aud: [CLIENT, "other-client"] }],
    ["azp ajeno", { azp: "other-client" }],
    ["emisor ajeno", { iss: "https://evil.example" }],
    ["emisor ausente", { iss: undefined }],
    ["sub ausente", { sub: undefined }],
    ["sub vacío", { sub: "" }],
    ["sub en blanco", { sub: "  " }],
    ["sub numérico", { sub: 123 }],
    ["sub demasiado largo", { sub: "s".repeat(256) }],
    ["correo ausente", { email: undefined }],
    ["correo numérico", { email: 123 }],
    ["correo inválido", { email: "invalid" }],
    ["correo no verificado", { email_verified: false }],
    ["correo verificado como texto", { email_verified: "true" }],
    ["correo verificado ausente", { email_verified: undefined }],
    ["nombre con tipo incorrecto", { name: { value: "Ana" } }],
    ["nonce con tipo incorrecto", { nonce: 123 }],
  ])("rechaza %s incluso con firma válida", async (_label, overrides) => {
    // SignJWT permite firmar claims mal tipados para probar el borde receptor.
    expect(await localVerifier()(await sign(overrides as JWTPayload))).toBeNull();
  });

  it.each([undefined, null, 123, {}, "", "not-a-jwt"])("rechaza entrada inválida: %j", async (input) => {
    expect(await localVerifier()(input)).toBeNull();
  });

  it("no acepta tokens cuando el cliente no está configurado", async () => {
    const token = await sign();
    expect(await localVerifier("")(token)).toBeNull();
    expect(await localVerifier("  ")(token)).toBeNull();
  });

  it("comprueba el nonce proporcionado por el servidor", async () => {
    const verify = localVerifier();
    const token = await sign({ nonce: "server-nonce" });
    expect(await verify(token, "server-nonce")).toEqual(identity);
    expect(await verify(token, "other-nonce")).toBeNull();
    expect(await verify(await sign(), "server-nonce")).toBeNull();
    expect(await verify(token, "")).toBeNull();
  });

  it("conserva el nombre opcional sin inventar uno", async () => {
    expect(await localVerifier()(await sign({ name: undefined }))).toEqual({ ...identity, name: "" });
  });
});

describe("JWKS remotos de Google sin conexiones reales", () => {
  beforeEach(() => vi.resetModules());

  async function remoteVerifier() {
    const module = await import("../src/public-booking/google-id-token.js");
    return module.createGoogleIdTokenVerifier(CLIENT);
  }

  it("usa solo la URL fija y comparte caché entre verificadores", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json(jwks));
    vi.stubGlobal("fetch", fetchMock);
    const verify = await remoteVerifier();
    const token = await sign({}, trusted.privateKey, {
      jku: "https://evil.example/jwks",
      x5u: "https://evil.example/cert",
    });
    expect(await verify(token)).toEqual(identity);
    expect(await (await remoteVerifier())(token)).toEqual(identity);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.googleapis.com/oauth2/v3/certs",
      expect.objectContaining({
        method: "GET",
        redirect: "manual",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("agrupa descargas concurrentes", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json(jwks));
    vi.stubGlobal("fetch", fetchMock);
    const verify = await remoteVerifier();
    const token = await sign();
    expect(await Promise.all([verify(token), verify(token), verify(token)])).toEqual([
      identity,
      identity,
      identity,
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rechaza una caída de JWKS y se recupera en un intento posterior", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(async () => Response.json(jwks));
    vi.stubGlobal("fetch", fetchMock);
    const verify = await remoteVerifier();
    const token = await sign();
    expect(await verify(token)).toBeNull();
    expect(await verify(token)).toEqual(identity);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["redirect", "invalid-json", "invalid-jwks"])("rechaza %s del servidor de claves", async (kind) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (kind === "redirect")
          return new Response(null, { status: 302, headers: { location: "https://evil.example" } });
        if (kind === "invalid-json") return new Response("not-json");
        return Response.json({ keys: "invalid" });
      }),
    );
    expect(await (await remoteVerifier())(await sign())).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("aborta la descarga a los 5 segundos y permite recuperarse después", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        async (_url, init: { signal: AbortSignal }) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
          }),
      )
      .mockImplementation(async () => Response.json(jwks));
    vi.stubGlobal("fetch", fetchMock);
    const verify = await remoteVerifier();
    const pending = verify(await sign());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(timeout).toHaveBeenCalledWith(5_000);
    controller.abort(new DOMException("Timed out", "TimeoutError"));
    expect(await pending).toBeNull();
    timeout.mockRestore();
    expect(await verify(await sign())).toEqual(identity);
  });

  it("renueva las claves al caducar la caché", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const fetchMock = vi.fn().mockImplementation(async () => Response.json(jwks));
    vi.stubGlobal("fetch", fetchMock);
    const verify = await remoteVerifier();
    const token = await sign();
    expect(await verify(token)).toEqual(identity);
    vi.setSystemTime(Date.now() + 10 * 60_000 + 1);
    expect(await verify(token)).toEqual(identity);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("recupera rotación de kid tras el cooldown y no descarga por cada kid desconocido", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const rotated = {
      keys: [{ ...(await exportJWK(attacker.publicKey)), kid: "rotated", alg: "RS256", use: "sig" }],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(jwks))
      .mockImplementation(async () => Response.json(rotated));
    vi.stubGlobal("fetch", fetchMock);
    const verify = await remoteVerifier();
    expect(await verify(await sign())).toEqual(identity);
    const token = await sign({}, attacker.privateKey, { kid: "rotated" });
    expect(await verify(token)).toBeNull();
    expect(await verify(token)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 30_001);
    expect(await verify(token)).toEqual(identity);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
