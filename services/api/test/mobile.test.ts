import { afterEach, describe, expect, it, vi } from "vitest";
import {
  exchangeGoogleCode,
  identityOf,
  resolveGoogleMobileIdentity,
} from "../src/public-booking/google-customer.js";

const jwt = (p: Record<string, unknown>) =>
  `e30.${Buffer.from(JSON.stringify(p)).toString("base64url")}.firma`;

const base = {
  email: "Ana@Gmail.com",
  email_verified: true,
  aud: "cliente-google",
  iss: "https://accounts.google.com",
  name: "Ana López",
};

afterEach(() => vi.unstubAllGlobals());

describe("autenticación móvil y Google OAuth (Android / iOS / Web)", () => {
  it("acepta un idToken directo de Google en las apps móviles", async () => {
    const env = {
      GOOGLE_CLIENT_ID: "cliente-google",
      GOOGLE_CLIENT_SECRET: "secreto",
      GOOGLE_TOKEN_URL: "http://captura:4010/google/token",
      TEST_MODE: false,
    } as never;

    const id = await resolveGoogleMobileIdentity(env, { idToken: jwt(base) });
    expect(id).toEqual({ email: "ana@gmail.com", name: "Ana López" });
  });

  it("canjea código de autorización con redirectUri móvil y codeVerifier PKCE", async () => {
    let sentBody = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        sentBody = String(init?.body ?? "");
        return new Response(JSON.stringify({ id_token: jwt(base) }), { status: 200 });
      }),
    );

    const env = {
      GOOGLE_CLIENT_ID: "cliente-google",
      GOOGLE_CLIENT_SECRET: "secreto",
      GOOGLE_TOKEN_URL: "http://captura:4010/google/token",
      TEST_MODE: false,
    } as never;

    const id = await exchangeGoogleCode(
      env,
      "codigo-movil-12345",
      "micitaentiempo://oauth/google",
      "pkce-verifier-1234567890",
    );
    expect(id).toEqual({ email: "ana@gmail.com", name: "Ana López" });
    expect(sentBody).toContain("redirect_uri=micitaentiempo%3A%2F%2Foauth%2Fgoogle");
    expect(sentBody).toContain("code_verifier=pkce-verifier-1234567890");
  });

  it("rechaza códigos o idTokens inválidos en móvil", async () => {
    const env = {
      GOOGLE_CLIENT_ID: "cliente-google",
      GOOGLE_CLIENT_SECRET: "secreto",
      GOOGLE_TOKEN_URL: "http://captura:4010/google/token",
      TEST_MODE: false,
    } as never;

    expect(await resolveGoogleMobileIdentity(env, { idToken: jwt({ ...base, aud: "otro" }) })).toBeNull();
    expect(identityOf(jwt({ ...base, email_verified: false }), "cliente-google", false)).toBeNull();
  });
});
