import { EmailField, FullName } from "@mcet/schemas";
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import type { GoogleIdentity } from "./google-customer.js";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), {
  timeoutDuration: 5_000,
  cacheMaxAge: 10 * 60_000,
  cooldownDuration: 30_000,
});

export interface VerifiedGoogleIdentity extends GoogleIdentity {
  subject: string;
}

/**
 * El resolvedor solo lo inyecta código de confianza (p. ej. JWKS locales en pruebas).
 * Nunca debe obtenerse del cuerpo de una petición ni de las cabeceras jku/x5u del token.
 */
export function createGoogleIdTokenVerifier(clientId: string, keys: JWTVerifyGetKey = googleKeys) {
  return async (idToken: unknown, expectedNonce?: string): Promise<VerifiedGoogleIdentity | null> => {
    if (!clientId.trim() || typeof idToken !== "string" || !idToken) return null;
    if (expectedNonce !== undefined && !expectedNonce) return null;
    try {
      const { payload } = await jwtVerify(idToken, keys, {
        algorithms: ["RS256"],
        issuer: ["accounts.google.com", "https://accounts.google.com"],
        audience: clientId,
        requiredClaims: ["sub", "iat", "exp", "email", "email_verified"],
      });

      const now = Math.floor(Date.now() / 1000);
      if (
        typeof payload.sub !== "string" ||
        !payload.sub.trim() ||
        payload.sub.length > 255 ||
        typeof payload.iat !== "number" ||
        !Number.isFinite(payload.iat) ||
        payload.iat > now ||
        typeof payload.exp !== "number" ||
        !Number.isFinite(payload.exp) ||
        payload.exp <= payload.iat ||
        payload.email_verified !== true ||
        (payload.name !== undefined && typeof payload.name !== "string") ||
        (payload.nonce !== undefined && typeof payload.nonce !== "string") ||
        (expectedNonce !== undefined && payload.nonce !== expectedNonce)
      )
        return null;

      // Este proyecto configura un solo cliente: no admitir audiencias múltiples ambiguas.
      if (payload.aud !== clientId || (payload.azp !== undefined && payload.azp !== clientId)) return null;
      const email = EmailField.safeParse(payload.email);
      if (!email.success) return null;
      const name = FullName.safeParse(payload.name);
      return {
        subject: payload.sub,
        email: email.data.toLowerCase(),
        name: name.success ? name.data : "",
      };
    } catch {
      // Una firma inválida o un JWKS inaccesible nunca produce una identidad ni una sesión.
      return null;
    }
  };
}
