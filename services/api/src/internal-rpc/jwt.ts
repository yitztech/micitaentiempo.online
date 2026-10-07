// JWT interno entre api y calendar (ADR 0003). Debe coincidir con services/calendar/internal/auth.
import { createHash } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

export const ISSUER_API = "mcet-api";
export const ISSUER_CALENDAR = "mcet-calendar";
export const AUDIENCE_API = "mcet-api";
export const AUDIENCE_CALENDAR = "mcet-calendar";
const TTL_SECONDS = 60;

export type ActorRole = "owner" | "editor" | "observer" | "customer" | "system";
export type ActorVia = "panel" | "embed" | "public" | "mcp" | "sync" | "system";

/** Actor del JWT interno (nombres cortos, iguales que en Go). */
export interface ActorClaims {
  sub?: string;
  org?: string;
  cal?: string;
  role: ActorRole;
  via?: ActorVia;
  loc?: string;
  tz?: string;
}

/** Clave HMAC de 32 bytes derivada del secreto compartido (SHA-256, como en Go). */
export function hmacKey(secret: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(secret, "utf8").digest());
}

export async function signInternal(
  secret: string,
  actor: ActorClaims,
  opts: { issuer: string; audience: string; requestId?: string },
): Promise<string> {
  return new SignJWT({ act: actor, ...(opts.requestId ? { rid: opts.requestId } : {}) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(opts.issuer)
    .setAudience(opts.audience)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(hmacKey(secret));
}

export async function verifyInternal(
  secret: string,
  token: string,
  opts: { issuer: string; audience: string },
): Promise<{ actor: ActorClaims; requestId?: string }> {
  const { payload } = await jwtVerify(token, hmacKey(secret), {
    issuer: opts.issuer,
    audience: opts.audience,
    algorithms: ["HS256"],
    requiredClaims: ["exp"],
    clockTolerance: 5,
  });
  const actor = payload.act as ActorClaims | undefined;
  if (!actor || typeof actor.role !== "string") throw new Error("token sin actor");
  return { actor, requestId: typeof payload.rid === "string" ? payload.rid : undefined };
}
