import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { exchangeGoogleCode, resolveGoogleMobileIdentity } from "../src/public-booking/google-customer.js";
import {
  GOOGLE_TEST_JWKS,
  GOOGLE_TEST_TOKEN_URL,
  googleSigningFixture,
  googleTestEnv,
} from "./helpers/google-oidc.js";

let fixture: Awaited<ReturnType<typeof googleSigningFixture>>;
beforeAll(async () => {
  fixture = await googleSigningFixture();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function googleFetch(token?: string) {
  const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    if (String(url) === GOOGLE_TEST_JWKS || String(url) === "https://www.googleapis.com/oauth2/v3/certs")
      return Response.json(fixture.jwks);
    if (String(url) === GOOGLE_TEST_TOKEN_URL) return Response.json({ id_token: token });
    throw new Error("Unexpected network access");
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("identidad Google compartida por web y móvil", () => {
  it("verifica la firma de un token directo y usa las claves oficiales fuera de TEST_MODE", async () => {
    const fetchMock = googleFetch();
    const env = { ...googleTestEnv(), TEST_MODE: undefined, GOOGLE_JWKS_FAKE_URL: undefined };
    expect(await resolveGoogleMobileIdentity(env, { idToken: await fixture.sign() })).toMatchObject({
      email: "ana@gmail.com",
      name: "Ana López",
    });
    expect(fetchMock).toHaveBeenCalledWith("https://www.googleapis.com/oauth2/v3/certs", expect.any(Object));
  });

  it.each(["postmessage", "micitaentiempo://oauth/google"])(
    "canjea código para %s y verifica el ID token recibido",
    async (redirectUri) => {
      const fetchMock = googleFetch(await fixture.sign());
      const env = googleTestEnv();
      const id = await exchangeGoogleCode(env, "code-test-123", redirectUri, "pkce-verifier-1234567890");
      expect(id).toMatchObject({ email: "ana@gmail.com", name: "Ana López" });
      const call = fetchMock.mock.calls.find(([url]) => String(url) === GOOGLE_TEST_TOKEN_URL);
      expect(call).toBeDefined();
      const body = new URLSearchParams(String(call?.[1]?.body));
      expect(body.get("redirect_uri")).toBe(redirectUri);
      expect(body.get("code_verifier")).toBe("pkce-verifier-1234567890");
      expect(body.get("client_id")).toBe(env.GOOGLE_CLIENT_ID);
    },
  );

  it.each([
    ["caducado", { exp: 1 }],
    ["sin exp", { exp: undefined }],
    ["otra audiencia", { aud: "other-client" }],
    ["otro emisor", { iss: "https://evil.example" }],
  ])("rechaza token %s también después del canje por código", async (_label, claims) => {
    googleFetch(await fixture.sign(claims));
    expect(await resolveGoogleMobileIdentity(googleTestEnv(), { code: "code-test-123" })).toBeNull();
  });

  it("no confía en firmas ficticias ni en tokens devueltos sin firma por el endpoint OAuth", async () => {
    const token = `e30.${Buffer.from(JSON.stringify({ email: "victim@example.com", email_verified: true })).toString("base64url")}.firma`;
    googleFetch(token);
    expect(await resolveGoogleMobileIdentity(googleTestEnv(), { idToken: token })).toBeNull();
    expect(await resolveGoogleMobileIdentity(googleTestEnv(), { code: "code-test-123" })).toBeNull();
  });

  it("fallos de canje o de claves no producen identidad", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sensitive upstream failure")));
    expect(await resolveGoogleMobileIdentity(googleTestEnv(), { code: "code-test-123" })).toBeNull();
    expect(await resolveGoogleMobileIdentity(googleTestEnv(), { idToken: await fixture.sign() })).toBeNull();
  });

  it("rechaza cuerpos OAuth inválidos y respuestas de error", async () => {
    for (const response of [
      new Response("invalid-json"),
      Response.json(null),
      Response.json({ error: "invalid_grant" }, { status: 400 }),
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      expect(await exchangeGoogleCode(googleTestEnv(), "code-test-123")).toBeNull();
    }
  });

  it("Google sin configurar no solicita claves ni canjea códigos", async () => {
    const fetchMock = googleFetch();
    const env = { ...googleTestEnv(), GOOGLE_CLIENT_ID: undefined };
    expect(await resolveGoogleMobileIdentity(env, { idToken: await fixture.sign() })).toBeNull();
    expect(await resolveGoogleMobileIdentity(env, { code: "code-test-123" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
