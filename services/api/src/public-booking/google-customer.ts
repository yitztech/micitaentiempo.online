import type { Lang } from "@mcet/i18n";
import { UnauthorizedException } from "@nestjs/common";
import { APIError } from "better-auth/api";
import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import type { Auth } from "../auth/auth.factory.js";
import { requireUnrestrictedUser } from "../auth/org-access.js";
import type { Env } from "../config/env.js";
import type { Database } from "../db/db.module.js";
import { createGoogleIdTokenVerifier } from "./google-id-token.js";

export interface GoogleIdentity {
  email: string;
  name: string;
}

const testKeyResolvers = new WeakMap<Env, JWTVerifyGetKey>();

function tokenVerifier(env: Env) {
  let keys: JWTVerifyGetKey | undefined;
  // Solo configuración del servidor en entornos de pruebas; las firmas siguen siendo obligatorias.
  if (env.TEST_MODE && env.GOOGLE_JWKS_FAKE_URL) {
    keys = testKeyResolvers.get(env);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(env.GOOGLE_JWKS_FAKE_URL), { timeoutDuration: 5_000 });
      testKeyResolvers.set(env, keys);
    }
  }
  return createGoogleIdTokenVerifier(env.GOOGLE_CLIENT_ID ?? "", keys);
}

/**
 * Cambia el código del popup de Google Identity Services (`redirect_uri=postmessage`) o del flujo OAuth
 * móvil PKCE por la identidad verificada. null si Google no está configurado o el código no vale.
 */
export async function exchangeGoogleCode(
  env: Env,
  code: string,
  redirectUri = "postmessage",
  codeVerifier?: string,
): Promise<GoogleIdentity | null> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  const params = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
  });
  const res = await fetch(env.GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
    signal: AbortSignal.timeout(15_000),
  }).catch(() => undefined);
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as { id_token?: string } | null;
  return tokenVerifier(env)(data?.id_token);
}

/**
 * Resuelve la identidad de Google a partir de un `idToken` nativo o de un `code` OAuth (web o móvil PKCE).
 */
export async function resolveGoogleMobileIdentity(
  env: Env,
  input: { code?: string; redirectUri?: string; codeVerifier?: string; idToken?: string },
): Promise<GoogleIdentity | null> {
  if (!env.GOOGLE_CLIENT_ID) return null;
  if (input.idToken) {
    return tokenVerifier(env)(input.idToken);
  }
  if (input.code) {
    return exchangeGoogleCode(env, input.code, input.redirectUri ?? "postmessage", input.codeVerifier);
  }
  return null;
}

/** Sesión Bearer para esa identidad (crea la cuenta, ya verificada, si no existe). */
export async function customerSessionFor(
  auth: Auth,
  id: GoogleIdentity,
  lang: Lang,
  db?: Pick<Database, "select">,
) {
  const ctx = await auth.$context;
  const found = await ctx.internalAdapter.findUserByEmail(id.email);
  let user = found?.user;
  if (!user) {
    user = await ctx.internalAdapter.createUser(
      { email: id.email, name: id.name, emailVerified: true, locale: lang },
      { method: "google-customer" },
    );
  } else {
    if (db) {
      await requireUnrestrictedUser(db, user.id);
    }
    if (!user.emailVerified) {
      user = (await ctx.internalAdapter.updateUser(user.id, { emailVerified: true })) ?? user;
    }
  }
  const session = await ctx.internalAdapter.createSession(user.id).catch((err: unknown) => {
    if (err instanceof APIError && err.statusCode === 401) {
      throw new UnauthorizedException({ code: "unauthenticated", message: "Sesión no válida" });
    }
    throw err;
  });
  if (!session) {
    throw new UnauthorizedException({ code: "unauthenticated", message: "Sesión no válida" });
  }
  const u = user as typeof user & { locale?: string; timezone?: string };
  return {
    token: session.token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: u.locale === "en" ? "en" : lang,
      timezone: u.timezone ?? "UTC",
      emailVerified: true,
    },
  };
}
