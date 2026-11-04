import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { OFFLINE_LIMITS } from "@mcet/schemas";

/** Vigencia de un cursor. Menor que la retención de `app.sync_changes` (31 días), así nunca hay lagunas. */
export const CURSOR_TTL_SECONDS = 30 * 86_400;

export type CursorPosition =
  /** Cambios: se entrega todo lo posterior a (txid, seq). */
  | { k: "c"; t: string; s: number }
  /** Snapshot en curso: marca de agua (xmin al empezar) y última clave entregada. */
  | { k: "s"; w: string; after: string | null };

interface CursorPayload {
  /** Versión del esquema del cursor. */
  v: 1;
  /** Actor al que pertenece. */
  a: string;
  /** Hash del ámbito autorizado cuando se emitió. */
  h: string;
  iat: number;
  exp: number;
  p: CursorPosition;
}

export class CursorError extends Error {
  constructor(readonly kind: "invalid" | "expired" | "scope_changed") {
    super(kind);
  }
}

const key = (secret: string) => createHash("sha256").update(`offline-cursor:${secret}`).digest();
const mac = (secret: string, body: string) =>
  createHmac("sha256", key(secret)).update(body).digest("base64url");

/** Huella del conjunto de organizaciones que el actor puede ver; cualquier alta o baja invalida los cursores. */
export function scopeHash(orgIds: string[]): string {
  return createHash("sha256")
    .update([...orgIds].sort().join(","))
    .digest("base64url")
    .slice(0, 16);
}

export function encodeCursor(
  secret: string,
  input: { actor: string; scope: string; position: CursorPosition; now: Date },
): string {
  const iat = Math.floor(input.now.getTime() / 1000);
  const payload: CursorPayload = {
    v: 1,
    a: input.actor,
    h: input.scope,
    iat,
    exp: iat + CURSOR_TTL_SECONDS,
    p: input.position,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${body}.${mac(secret, body)}`;
  if (token.length > OFFLINE_LIMITS.cursor) throw new Error("offline cursor too long");
  return token;
}

/**
 * Valida firma, versión, forma y dueño del cursor. Un cursor firmado para otra cuenta es `invalid` (igual que uno
 * falsificado: no revela si existe). Caducidad y cambio de ámbito son distintos porque el cliente debe reiniciar.
 */
export function decodeCursor(
  secret: string,
  token: string,
  expected: { actor: string; scope: string; now: Date },
): CursorPosition {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) throw new CursorError("invalid");
  const expectedSig = Buffer.from(mac(secret, body));
  const given = Buffer.from(signature);
  if (given.length !== expectedSig.length || !timingSafeEqual(given, expectedSig)) {
    throw new CursorError("invalid");
  }
  let payload: CursorPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CursorPayload;
  } catch {
    throw new CursorError("invalid");
  }
  const p = payload.p;
  const valid =
    payload.v === 1 &&
    typeof payload.a === "string" &&
    typeof payload.h === "string" &&
    Number.isInteger(payload.iat) &&
    Number.isInteger(payload.exp) &&
    typeof p === "object" &&
    p !== null &&
    ((p.k === "c" && /^\d{1,20}$/.test(p.t) && Number.isInteger(p.s) && p.s >= 0) ||
      (p.k === "s" && /^\d{1,20}$/.test(p.w) && (p.after === null || typeof p.after === "string")));
  if (!valid || payload.a !== expected.actor) throw new CursorError("invalid");
  if (Math.floor(expected.now.getTime() / 1000) >= payload.exp) throw new CursorError("expired");
  if (payload.h !== expected.scope) throw new CursorError("scope_changed");
  return p;
}
