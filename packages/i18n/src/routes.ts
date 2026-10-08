import type { Lang } from "./languages.ts";

/**
 * Mapa común de rutas traducidas: un id, una ruta por idioma.
 * `indexable` marca las páginas que van al sitemap.
 */
export const ROUTES = {
  home: { es: "/", en: "/", indexable: true },
  pricing: { es: "/precios", en: "/pricing", indexable: true },
  features: { es: "/funciones", en: "/features", indexable: true },
  faq: { es: "/preguntas-frecuentes", en: "/faq", indexable: true },
  connectAi: { es: "/conecta-tu-ia", en: "/connect-your-ai", indexable: true },
  contact: { es: "/contacto", en: "/contact", indexable: true },
  privacy: { es: "/privacidad", en: "/privacy", indexable: true },
  terms: { es: "/condiciones", en: "/terms", indexable: true },
  credits: { es: "/creditos", en: "/credits", indexable: true },
  signUp: { es: "/registro", en: "/sign-up", indexable: false },
  signIn: { es: "/entrar", en: "/sign-in", indexable: false },
  forgotPassword: { es: "/recuperar-contrasena", en: "/forgot-password", indexable: false },
  resetPassword: { es: "/nueva-contrasena", en: "/reset-password", indexable: false },
  verifyEmail: { es: "/verificar-correo", en: "/verify-email", indexable: false },
  invitation: { es: "/invitacion/:token", en: "/invitation/:token", indexable: false },
  welcome: { es: "/bienvenida", en: "/welcome", indexable: false },
  booking: { es: "/reservar/:slug", en: "/book/:slug", indexable: false },
  myAppointments: { es: "/citas", en: "/appointments", indexable: false },
  myAppointment: { es: "/citas/:id", en: "/appointments/:id", indexable: false },
  dashboard: { es: "/panel", en: "/dashboard", indexable: false },
  calendar: { es: "/panel/calendarios/:id", en: "/dashboard/calendars/:id", indexable: false },
  calendarSettings: {
    es: "/panel/calendarios/:id/ajustes",
    en: "/dashboard/calendars/:id/settings",
    indexable: false,
  },
  calendarTeam: {
    es: "/panel/calendarios/:id/equipo",
    en: "/dashboard/calendars/:id/team",
    indexable: false,
  },
  customers: { es: "/panel/clientes", en: "/dashboard/customers", indexable: false },
  inbox: { es: "/panel/avisos", en: "/dashboard/notifications", indexable: false },
  account: { es: "/panel/cuenta", en: "/dashboard/account", indexable: false },
  notificationSettings: {
    es: "/panel/cuenta/avisos",
    en: "/dashboard/account/notifications",
    indexable: false,
  },
  integrations: { es: "/panel/integraciones", en: "/dashboard/integrations", indexable: false },
  ai: { es: "/panel/ia", en: "/dashboard/ai", indexable: false },
  billing: { es: "/panel/facturacion", en: "/dashboard/billing", indexable: false },
  oauthConsent: { es: "/oauth/consentimiento", en: "/oauth/consent", indexable: false },
} as const satisfies Record<string, { es: string; en: string; indexable: boolean }>;

export type RouteId = keyof typeof ROUTES;

export function pathFor(id: RouteId, lang: Lang, params: Record<string, string> = {}): string {
  return ROUTES[id][lang].replace(/:(\w+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Falta el parámetro ${name} para la ruta ${id}`);
    return encodeURIComponent(value);
  });
}

function toRegex(pattern: string): RegExp {
  const body = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\?:(\w+)/g, "(?<$1>[^/]+)");
  return new RegExp(`^${body}/?$`);
}

const MATCHERS = (Object.keys(ROUTES) as RouteId[]).flatMap((id) =>
  (["es", "en"] as const).map((lang) => ({ id, lang, re: toRegex(ROUTES[id][lang]) })),
);

/** Identifica una ruta traducida y el idioma al que pertenece su forma. */
export function matchRoute(
  pathname: string,
): { id: RouteId; lang: Lang; params: Record<string, string> } | null {
  const clean = pathname.replace(/\.data$/, "");
  for (const m of MATCHERS) {
    const r = m.re.exec(clean);
    if (r) return { id: m.id, lang: m.lang, params: { ...(r.groups ?? {}) } };
  }
  return null;
}

/** Ruta equivalente en el otro idioma, o null si no es una ruta del mapa. */
export function translatePath(pathname: string, to: Lang): string | null {
  const m = matchRoute(pathname);
  return m ? pathFor(m.id, to, m.params) : null;
}
