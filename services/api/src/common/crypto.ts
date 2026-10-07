import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const key = (secret: string) => createHash("sha256").update(`enc:${secret}`).digest();

/** Cifra un valor con AES-256-GCM (APP_ENC_KEY): iv.tag.datos en base64url. */
export function seal(secret: string, value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(secret), iv);
  const data = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function open<T>(secret: string, sealed: string): T {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !data) throw new Error("dato cifrado inválido");
  const d = createDecipheriv("aes-256-gcm", key(secret), iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString("utf8")) as T;
}

/** Firma corta (HMAC-SHA256) para enlaces de un clic (darse de baja). */
export function sign(secret: string, payload: string): string {
  return createHmac("sha256", `sig:${secret}`).update(payload).digest("base64url").slice(0, 32);
}

export function verify(secret: string, payload: string, signature: string): boolean {
  const a = Buffer.from(sign(secret, payload));
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
