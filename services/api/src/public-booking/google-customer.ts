import type { Lang } from "@mcet/i18n";
import type { Auth } from "../auth/auth.factory.js";
import type { Env } from "../config/env.js";

const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

export interface GoogleIdentity {
  email: string;
  name: string;
}

/**
 * Identidad del `id_token` de Google recibido directamente de su endpoint de tokens por TLS (OIDC Core
 * §3.1.3.7 permite validar por el canal en lugar de la firma). Exige correo verificado, nuestra audiencia
 * y el emisor de Google; si no, null.
 */
export function identityOf(idToken: unknown, clientId: string, testMode: boolean): GoogleIdentity | null {
  if (typeof idToken !== "string") return null;
  let p: { email?: unknown; email_verified?: unknown; aud?: unknown; iss?: unknown; name?: unknown };
  try {
    p = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof p.email !== "string" || p.email_verified !== true) return null;
  if (p.aud !== clientId) return null;
  if (!testMode && !GOOGLE_ISSUERS.has(String(p.iss))) return null;
  return { email: p.email.toLowerCase(), name: typeof p.name === "string" ? p.name : "" };
}

/**
 * Cambia el código del popup de Google Identity Services (`redirect_uri=postmessage`) por la identidad
 * verificada. null si Google no está configurado o el código no vale.
 */
export async function exchangeGoogleCode(env: Env, code: string): Promise<GoogleIdentity | null> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  const res = await fetch(env.GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: "postmessage",
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => undefined);
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as { id_token?: string } | null;
  return identityOf(data?.id_token, env.GOOGLE_CLIENT_ID, Boolean(env.TEST_MODE));
}

/** Sesión del cliente final para esa identidad (crea la cuenta, ya verificada, si no existe). */
export async function customerSessionFor(auth: Auth, id: GoogleIdentity, lang: Lang) {
  const ctx = await auth.$context;
  const found = await ctx.internalAdapter.findUserByEmail(id.email);
  let user = found?.user;
  if (!user) {
    user = await ctx.internalAdapter.createUser(
      { email: id.email, name: id.name, emailVerified: true, locale: lang },
      { method: "google-customer" },
    );
  } else if (!user.emailVerified) {
    user = (await ctx.internalAdapter.updateUser(user.id, { emailVerified: true })) ?? user;
  }
  const session = await ctx.internalAdapter.createSession(user.id);
  return { token: session.token, user: { id: user.id, email: user.email, name: user.name } };
}
