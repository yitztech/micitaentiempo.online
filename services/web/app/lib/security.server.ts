import { randomBytes } from "node:crypto";

export function newNonce(): string {
  return randomBytes(16).toString("base64");
}

function originOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/** CSP de las páginas HTML. El embed y la facturación la amplían en sus rutas. */
export function contentSecurityPolicy(nonce: string, opts: { frameAncestors?: string } = {}): string {
  const umami = originOf(process.env.UMAMI_SCRIPT_URL);
  const extra = umami ? ` ${umami}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${extra}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src 'self'${extra}`,
    `frame-ancestors ${opts.frameAncestors ?? "'none'"}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function applyPageHeaders(headers: Headers, nonce: string, pathname: string): void {
  const isEmbed = pathname.startsWith("/embed/");
  if (process.env.NODE_ENV === "production" && !headers.has("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", contentSecurityPolicy(nonce));
  }
  if (!isEmbed) headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("Cross-Origin-Opener-Policy", isEmbed ? "same-origin-allow-popups" : "same-origin");
}
