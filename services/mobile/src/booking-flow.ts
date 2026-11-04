import type { Lang } from "../../../packages/i18n/src/languages.ts";
import { pathFor } from "../../../packages/i18n/src/routes.ts";

/** Destino de reserva tal como lo publica la API (`BusinessBookingTarget`). */
export interface BookingTarget {
  calendarId: string;
  locationId: string;
  slug: string;
  bookingUrl: string;
  reservable: boolean;
}

/** Intención de reserva: solo identifica el destino. Nunca contiene contraseñas, OTP, tokens ni holds. */
export interface BookingIntent {
  businessId: string;
  calendarId: string;
  locationId: string;
  slug: string;
  /** URL absoluta ya validada de la página de reserva del propio sitio. */
  url: string;
}

const SLUG = /^[a-z0-9](-?[a-z0-9])*$/;
const HTTP_URL = /^(https?):\/\/([^/?#@\s:\\]+)(?::(\d{1,5}))?(\/[^?#\s\\]*)?$/i;

interface ParsedUrl {
  protocol: "http" | "https";
  host: string;
  port: string;
  path: string;
}

/** Análisis propio: `URL` de React Native está incompleto. Rechaza credenciales, consulta, fragmento y `\`. */
function parseHttpUrl(value: string): ParsedUrl | null {
  const match = HTTP_URL.exec(value.trim());
  if (!match) return null;
  const protocol = match[1]?.toLowerCase() as "http" | "https";
  const defaultPort = protocol === "https" ? "443" : "80";
  return {
    protocol,
    host: (match[2] ?? "").toLowerCase(),
    port: match[3] ?? defaultPort,
    path: match[4] ?? "/",
  };
}

const isLocalHost = (host: string) =>
  host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1";

/**
 * Ruta de reserva aceptada para el slug: la forma corta que publica la API (`/c/<slug>`) o la ruta traducida real
 * de la página de reserva en cualquiera de los idiomas del sitio.
 */
function isBookingPathFor(path: string, slug: string): boolean {
  if (path === `/c/${slug}`) return true;
  return (["es", "en", "fr", "pt", "de", "it"] as const).some(
    (lang) => pathFor("booking", lang, { slug }) === path,
  );
}

/**
 * Valida el destino contra el sitio configurado y devuelve la URL canónica de reserva en el idioma de la app, o
 * `null` si no es seguro abrirla. Solo se usa el `slug` (con el formato de la API); el resto de `bookingUrl` solo
 * puede coincidir, nunca decidir el destino: esquemas distintos de http(s), otro host o puerto, credenciales,
 * consulta, fragmento, `//` y rutas ajenas se rechazan.
 */
export function resolveBookingUrl({
  target,
  siteUrl,
  lang,
}: {
  target: Pick<BookingTarget, "slug" | "bookingUrl">;
  siteUrl: string;
  lang: Lang;
}): string | null {
  const site = parseHttpUrl(siteUrl.replace(/\/+$/, ""));
  if (!site || (site.path !== "/" && site.path !== "") || site.protocol === undefined) return null;
  if (site.protocol !== "https" && !isLocalHost(site.host)) return null;
  const { slug, bookingUrl } = target;
  if (slug.length < 3 || slug.length > 60 || !SLUG.test(slug)) return null;

  if (bookingUrl.startsWith("/")) {
    if (bookingUrl.startsWith("//") || /[\\?#\s]/.test(bookingUrl)) return null;
    if (!isBookingPathFor(bookingUrl, slug)) return null;
  } else {
    const absolute = parseHttpUrl(bookingUrl);
    if (!absolute || absolute.protocol !== site.protocol) return null;
    if (absolute.host !== site.host || absolute.port !== site.port) return null;
    if (!isBookingPathFor(absolute.path, slug)) return null;
  }
  const origin = `${site.protocol}://${site.host}${site.port === (site.protocol === "https" ? "443" : "80") ? "" : `:${site.port}`}`;
  return `${origin}${pathFor("booking", lang, { slug })}`;
}

export type SelectResult =
  | { ok: true; intent: BookingIntent }
  | { ok: false; reason: "unavailable" | "invalid_link" };

export type BookingFlowResult =
  | { status: "no_selection" }
  | { status: "offline" }
  | { status: "browser_error" }
  /** El servidor muestra una cita nueva tras volver del navegador. */
  | { status: "confirmed"; newBookings: number }
  /** Con sesión en la app, el servidor no muestra ninguna cita nueva. */
  | { status: "not_confirmed" }
  /** Sin sesión o sin conexión al volver: no se puede comprobar; no se afirma nada. */
  | { status: "unknown" };

export interface BookingFlowOptions {
  siteUrl: string;
  lang: Lang;
  isOnline: () => boolean;
  /** Abre el navegador seguro del sistema y resuelve cuando la persona vuelve a la app. */
  openBrowser: (url: string) => Promise<void>;
  /** Citas actuales del servidor, o `null` si no hay sesión en la app. */
  listBookings: () => Promise<Array<{ id: string }> | null>;
}

/**
 * Recorrido directorio → negocio → calendario/sede → reserva. La reserva se completa en la página del proyecto
 * (disponibilidad actual, verificación de contacto y antibots los decide el servidor) abierta en el navegador
 * seguro, sin pasar tokens por la URL. La app nunca da por confirmada una reserva por haber abierto la página:
 * solo lo hace si, al volver, el servidor lista una cita que antes no existía.
 */
export function createBookingFlow(provider: BookingFlowOptions | (() => BookingFlowOptions)) {
  // Con una función, la configuración (dominio, idioma, sesión, conexión) se lee en cada uso: el flujo —y la
  // intención elegida— sobrevive a re-renderizados y al inicio de sesión sin recrearse.
  const current = (): BookingFlowOptions => (typeof provider === "function" ? provider() : provider);
  let intent: BookingIntent | null = null;
  let running: Promise<BookingFlowResult> | null = null;

  return {
    intent: () => intent,

    /** Elige un destino. Sustituye al anterior; uno no reservable o con enlace inválido no deja intención. */
    select(businessId: string, target: BookingTarget): SelectResult {
      if (!target.reservable) {
        intent = null;
        return { ok: false, reason: "unavailable" };
      }
      const url = resolveBookingUrl({ target, siteUrl: current().siteUrl, lang: current().lang });
      if (!url) {
        intent = null;
        return { ok: false, reason: "invalid_link" };
      }
      intent = {
        businessId,
        calendarId: target.calendarId,
        locationId: target.locationId,
        slug: target.slug,
        url,
      };
      return { ok: true, intent };
    },

    /** Olvida la intención (p. ej. al elegir otro negocio). Volver atrás NO la borra. */
    clear() {
      intent = null;
    },

    /** Abre la reserva del destino elegido y reconcilia con el servidor al volver. */
    open(): Promise<BookingFlowResult> {
      if (running) return running;
      const chosen = intent;
      if (!chosen) return Promise.resolve({ status: "no_selection" });
      const options = current();
      if (!options.isOnline()) return Promise.resolve({ status: "offline" });
      running = (async (): Promise<BookingFlowResult> => {
        const before = await options.listBookings().catch(() => null);
        try {
          await options.openBrowser(chosen.url);
        } catch {
          return { status: "browser_error" };
        }
        const after = await current()
          .listBookings()
          .catch(() => null);
        if (!before || !after) return { status: "unknown" };
        const known = new Set(before.map((b) => b.id));
        const created = after.filter((b) => !known.has(b.id)).length;
        return created > 0 ? { status: "confirmed", newBookings: created } : { status: "not_confirmed" };
      })().finally(() => {
        running = null;
      });
      return running;
    },
  };
}

export type BookingFlow = ReturnType<typeof createBookingFlow>;
