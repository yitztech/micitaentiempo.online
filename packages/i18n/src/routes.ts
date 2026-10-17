import { LANGS, type Lang } from "./languages.ts";

/**
 * Mapa común de rutas traducidas: un id, una ruta por idioma.
 * `indexable` marca las páginas que van al sitemap.
 */
export const ROUTES = {
  home: { es: "/", en: "/", fr: "/fr", pt: "/pt", de: "/de", it: "/it", indexable: true },
  pricing: {
    es: "/precios",
    en: "/pricing",
    fr: "/fr/tarifs",
    pt: "/pt/precos",
    de: "/de/preise",
    it: "/it/prezzi",
    indexable: true,
  },
  features: {
    es: "/funciones",
    en: "/features",
    fr: "/fr/fonctionnalites",
    pt: "/pt/funcionalidades",
    de: "/de/funktionen",
    it: "/it/funzionalita",
    indexable: true,
  },
  faq: {
    es: "/preguntas-frecuentes",
    en: "/faq",
    fr: "/fr/faq",
    pt: "/pt/perguntas-frequentes",
    de: "/de/faq",
    it: "/it/faq",
    indexable: true,
  },
  connectAi: {
    es: "/conecta-tu-ia",
    en: "/connect-your-ai",
    fr: "/fr/connectez-votre-ia",
    pt: "/pt/conecte-sua-ia",
    de: "/de/verbinden-sie-ihre-ki",
    it: "/it/connetti-la-tua-ia",
    indexable: true,
  },
  contact: {
    es: "/contacto",
    en: "/contact",
    fr: "/fr/contact",
    pt: "/pt/contato",
    de: "/de/kontakt",
    it: "/it/contatto",
    indexable: true,
  },
  privacy: {
    es: "/privacidad",
    en: "/privacy",
    fr: "/fr/confidentialite",
    pt: "/pt/privacidade",
    de: "/de/datenschutz",
    it: "/it/privacy",
    indexable: true,
  },
  terms: {
    es: "/condiciones",
    en: "/terms",
    fr: "/fr/conditions",
    pt: "/pt/termos",
    de: "/de/agb",
    it: "/it/termini",
    indexable: true,
  },
  credits: {
    es: "/creditos",
    en: "/credits",
    fr: "/fr/credits",
    pt: "/pt/creditos",
    de: "/de/credits",
    it: "/it/crediti",
    indexable: true,
  },
  downloadApp: {
    es: "/descargar",
    en: "/download",
    fr: "/fr/telecharger",
    pt: "/pt/baixar",
    de: "/de/herunterladen",
    it: "/it/scarica",
    indexable: true,
  },
  signUp: {
    es: "/registro",
    en: "/sign-up",
    fr: "/fr/inscription",
    pt: "/pt/cadastro",
    de: "/de/registrieren",
    it: "/it/registrazione",
    indexable: false,
  },
  signIn: {
    es: "/entrar",
    en: "/sign-in",
    fr: "/fr/connexion",
    pt: "/pt/entrar",
    de: "/de/anmelden",
    it: "/it/accedi",
    indexable: false,
  },
  forgotPassword: {
    es: "/recuperar-contrasena",
    en: "/forgot-password",
    fr: "/fr/mot-de-passe-oublie",
    pt: "/pt/recuperar-senha",
    de: "/de/passwort-vergessen",
    it: "/it/recupero-password",
    indexable: false,
  },
  resetPassword: {
    es: "/nueva-contrasena",
    en: "/reset-password",
    fr: "/fr/reinitialiser-mot-de-passe",
    pt: "/pt/redefinir-senha",
    de: "/de/passwort-zuruecksetzen",
    it: "/it/reimposta-password",
    indexable: false,
  },
  verifyEmail: {
    es: "/verificar-correo",
    en: "/verify-email",
    fr: "/fr/verifier-email",
    pt: "/pt/verificar-email",
    de: "/de/e-mail-bestaetigen",
    it: "/it/verifica-email",
    indexable: false,
  },
  invitation: {
    es: "/invitacion/:token",
    en: "/invitation/:token",
    fr: "/fr/invitation/:token",
    pt: "/pt/convite/:token",
    de: "/de/einladung/:token",
    it: "/it/invito/:token",
    indexable: false,
  },
  welcome: {
    es: "/bienvenida",
    en: "/welcome",
    fr: "/fr/bienvenue",
    pt: "/pt/boas-vindas",
    de: "/de/willkommen",
    it: "/it/benvenuto",
    indexable: false,
  },
  booking: {
    es: "/reservar/:slug",
    en: "/book/:slug",
    fr: "/fr/reserver/:slug",
    pt: "/pt/agendar/:slug",
    de: "/de/buchen/:slug",
    it: "/it/prenota/:slug",
    indexable: false,
  },
  myAppointments: {
    es: "/citas",
    en: "/appointments",
    fr: "/fr/rendez-vous",
    pt: "/pt/agendamentos",
    de: "/de/termine",
    it: "/it/appuntamenti",
    indexable: false,
  },
  myAppointment: {
    es: "/citas/:id",
    en: "/appointments/:id",
    fr: "/fr/rendez-vous/:id",
    pt: "/pt/agendamentos/:id",
    de: "/de/termine/:id",
    it: "/it/appuntamenti/:id",
    indexable: false,
  },
  dashboard: {
    es: "/panel",
    en: "/dashboard",
    fr: "/fr/tableau-de-bord",
    pt: "/pt/painel",
    de: "/de/dashboard",
    it: "/it/pannello",
    indexable: false,
  },
  calendar: {
    es: "/panel/calendarios/:id",
    en: "/dashboard/calendars/:id",
    fr: "/fr/tableau-de-bord/calendriers/:id",
    pt: "/pt/painel/calendarios/:id",
    de: "/de/dashboard/kalender/:id",
    it: "/it/pannello/calendari/:id",
    indexable: false,
  },
  calendarSettings: {
    es: "/panel/calendarios/:id/ajustes",
    en: "/dashboard/calendars/:id/settings",
    fr: "/fr/tableau-de-bord/calendriers/:id/parametres",
    pt: "/pt/painel/calendarios/:id/configuracoes",
    de: "/de/dashboard/kalender/:id/einstellungen",
    it: "/it/pannello/calendari/:id/impostazioni",
    indexable: false,
  },
  calendarTeam: {
    es: "/panel/calendarios/:id/equipo",
    en: "/dashboard/calendars/:id/team",
    fr: "/fr/tableau-de-bord/calendriers/:id/equipe",
    pt: "/pt/painel/calendarios/:id/equipe",
    de: "/de/dashboard/kalender/:id/team",
    it: "/it/pannello/calendari/:id/team",
    indexable: false,
  },
  customers: {
    es: "/panel/clientes",
    en: "/dashboard/customers",
    fr: "/fr/tableau-de-bord/clients",
    pt: "/pt/painel/clientes",
    de: "/de/dashboard/kunden",
    it: "/it/pannello/clienti",
    indexable: false,
  },
  inbox: {
    es: "/panel/avisos",
    en: "/dashboard/notifications",
    fr: "/fr/tableau-de-bord/notifications",
    pt: "/pt/painel/notificacoes",
    de: "/de/dashboard/benachrichtigungen",
    it: "/it/pannello/notifiche",
    indexable: false,
  },
  account: {
    es: "/panel/cuenta",
    en: "/dashboard/account",
    fr: "/fr/tableau-de-bord/compte",
    pt: "/pt/painel/conta",
    de: "/de/dashboard/konto",
    it: "/it/pannello/account",
    indexable: false,
  },
  notificationSettings: {
    es: "/panel/cuenta/avisos",
    en: "/dashboard/account/notifications",
    fr: "/fr/tableau-de-bord/compte/notifications",
    pt: "/pt/painel/conta/notificacoes",
    de: "/de/dashboard/konto/benachrichtigungen",
    it: "/it/pannello/account/notifiche",
    indexable: false,
  },
  integrations: {
    es: "/panel/integraciones",
    en: "/dashboard/integrations",
    fr: "/fr/tableau-de-bord/integrations",
    pt: "/pt/painel/integracoes",
    de: "/de/dashboard/integrationen",
    it: "/it/pannello/integrazioni",
    indexable: false,
  },
  ai: {
    es: "/panel/ia",
    en: "/dashboard/ai",
    fr: "/fr/tableau-de-bord/ia",
    pt: "/pt/painel/ia",
    de: "/de/dashboard/ki",
    it: "/it/pannello/ia",
    indexable: false,
  },
  billing: {
    es: "/panel/facturacion",
    en: "/dashboard/billing",
    fr: "/fr/tableau-de-bord/facturation",
    pt: "/pt/painel/faturamento",
    de: "/de/dashboard/abrechnung",
    it: "/it/pannello/fatturazione",
    indexable: false,
  },
  oauthConsent: {
    es: "/oauth/consentimiento",
    en: "/oauth/consent",
    fr: "/fr/oauth/consentement",
    pt: "/pt/oauth/consentimento",
    de: "/de/oauth/zustimmung",
    it: "/it/oauth/consenso",
    indexable: false,
  },
} as const satisfies Record<string, Record<Lang, string> & { indexable: boolean }>;

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
  LANGS.flatMap((lang) => {
    const canonical = ROUTES[id][lang];
    const matchers = [{ id, lang, re: toRegex(canonical) }];
    if (canonical.startsWith(`/${lang}/`)) {
      matchers.push({ id, lang, re: toRegex(canonical.slice(lang.length + 1)) });
    }
    return matchers;
  }),
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
