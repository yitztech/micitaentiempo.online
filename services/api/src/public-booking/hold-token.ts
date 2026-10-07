import { createHmac } from "node:crypto";

/**
 * El hold se aparta antes de saber quién es el cliente. Quien lo aparta recibe un token secreto;
 * al motor solo viaja un id derivado (UUID v8 de un HMAC), así que ni el panel ni los logs del motor
 * permiten reconstruir el token. El token sale de la Idempotency-Key: un reintento obtiene el mismo.
 */
export function holdToken(secret: string, calendarId: string, idempotencyKey: string): string {
  return createHmac("sha256", secret)
    .update(`hold-token:${calendarId}:${idempotencyKey}`)
    .digest("base64url");
}

export function holderId(secret: string, token: string): string {
  const h = createHmac("sha256", secret).update(`holder:${token}`).digest().subarray(0, 16);
  h[6] = ((h[6] ?? 0) & 0x0f) | 0x80; // versión 8 (RFC 9562)
  h[8] = ((h[8] ?? 0) & 0x3f) | 0x80; // variante RFC
  const hex = h.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
