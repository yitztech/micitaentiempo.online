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
export function contentSecurityPolicy(
  nonce: string,
  opts: { frameAncestors?: string; stripe?: boolean; google?: boolean } = {},
): string {
  const umami = originOf(process.env.UMAMI_SCRIPT_URL);
  const extra = umami ? ` ${umami}` : "";
  // Solo en facturación y con Stripe activo (07-frontend.md §7.10).
  const stripeScript = opts.stripe ? " https://js.stripe.com" : "";
  const stripeConnect = opts.stripe ? " https://api.stripe.com" : "";
  // «Continuar con Google» del cliente final (Google Identity Services, 07-frontend.md §7.5).
  const gsi = opts.google ? " https://accounts.google.com/gsi/" : "";
  const frames = [
    ...(opts.stripe ? ["https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com"] : []),
    ...(opts.google ? ["https://accounts.google.com/gsi/"] : []),
  ];
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${extra}${stripeScript}${gsi && " https://accounts.google.com/gsi/client"}`,
    `style-src 'self' 'unsafe-inline'${gsi && " https://accounts.google.com/gsi/style"}`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${extra}${stripeConnect}${gsi}`,
    ...(frames.length ? [`frame-src ${frames.join(" ")}`] : []),
    `frame-ancestors ${opts.frameAncestors ?? "'none'"}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

/** Páginas del cliente final con verificación: admiten el popup de Google. */
const CUSTOMER_PAGE = /^\/(reservar|book|citas|appointments|embed)(\/|$)/;

export function applyPageHeaders(headers: Headers, nonce: string, pathname: string): void {
  const isEmbed = pathname.startsWith("/embed/");
  const customer = CUSTOMER_PAGE.test(pathname);
  if (process.env.NODE_ENV === "production" && !headers.has("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", contentSecurityPolicy(nonce, { google: customer }));
  }
  if (!isEmbed) headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  // El popup de Google necesita volver a quien lo abrió.
  headers.set("Cross-Origin-Opener-Policy", customer ? "same-origin-allow-popups" : "same-origin");
  // Lo que no es público (panel, acceso, reservas) no se guarda en cachés compartidas ni del navegador.
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "private, no-store");
  // Las páginas solo se cargan desde su propio origen; el iframe del embed vive en webs de terceros.
  headers.set("Cross-Origin-Resource-Policy", isEmbed ? "cross-origin" : "same-origin");
}
