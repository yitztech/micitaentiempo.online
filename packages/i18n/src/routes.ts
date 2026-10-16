import { LANGS, type Lang } from "./languages.ts";

/**
 * Mapa común de rutas traducidas: un id, una ruta por idioma.
 * `indexable` marca las páginas que van al sitemap.
 */
export const ROUTES = {
  home: { es: "/", en: "/", fr: "/", pt: "/", de: "/", it: "/", indexable: true },
  pricing: {
    es: "/precios",
    en: "/pricing",
    fr: "/tarifs",
    pt: "/precos",
    de: "/preise",
    it: "/prezzi",
    indexable: true,
  },
  features: {
    es: "/funciones",
    en: "/features",
    fr: "/fonctionnalites",
    pt: "/funcionalidades",
    de: "/funktionen",
    it: "/funzionalita",
    indexable: true,
  },
  faq: {
    es: "/preguntas-frecuentes",
    en: "/faq",
    fr: "/faq",
    pt: "/perguntas-frequentes",
    de: "/faq",
    it: "/faq",
    indexable: true,
  },
  connectAi: {
    es: "/conecta-tu-ia",
    en: "/connect-your-ai",
    fr: "/connectez-votre-ia",
    pt: "/conecte-sua-ia",
    de: "/verbinden-sie-ihre-ki",
    it: "/connetti-la-tua-ia",
    indexable: true,
  },
  contact: {
    es: "/contacto",
    en: "/contact",
    fr: "/contact",
    pt: "/contato",
    de: "/kontakt",
    it: "/contatto",
    indexable: true,
  },
  privacy: {
    es: "/privacidad",
    en: "/privacy",
    fr: "/confidentialite",
    pt: "/privacidade",
    de: "/datenschutz",
    it: "/privacy",
    indexable: true,
  },
  terms: {
    es: "/condiciones",
    en: "/terms",
    fr: "/conditions",
    pt: "/termos",
    de: "/agb",
    it: "/termini",
    indexable: true,
  },
  credits: {
    es: "/creditos",
    en: "/credits",
    fr: "/credits",
    pt: "/creditos",
    de: "/credits",
    it: "/crediti",
    indexable: true,
  },
  signUp: {
    es: "/registro",
    en: "/sign-up",
    fr: "/inscription",
    pt: "/cadastro",
    de: "/registrieren",
    it: "/registrazione",
    indexable: false,
  },
  signIn: {
    es: "/entrar",
    en: "/sign-in",
    fr: "/connexion",
    pt: "/entrar",
    de: "/anmelden",
    it: "/accedi",
    indexable: false,
  },
  forgotPassword: {
    es: "/recuperar-contrasena",
    en: "/forgot-password",
    fr: "/mot-de-passe-oublie",
    pt: "/recuperar-senha",
    de: "/passwort-vergessen",
    it: "/recupero-password",
    indexable: false,
  },
  resetPassword: {
    es: "/nueva-contrasena",
    en: "/reset-password",
    fr: "/reinitialiser-mot-de-passe",
    pt: "/redefinir-senha",
    de: "/passwort-zuruecksetzen",
    it: "/reimposta-password",
    indexable: false,
  },
  verifyEmail: {
    es: "/verificar-correo",
    en: "/verify-email",
    fr: "/verifier-email",
    pt: "/verificar-email",
    de: "/e-mail-bestaetigen",
    it: "/verifica-email",
    indexable: false,
  },
  invitation: {
    es: "/invitacion/:token",
    en: "/invitation/:token",
    fr: "/invitation/:token",
    pt: "/convite/:token",
    de: "/einladung/:token",
    it: "/invito/:token",
    indexable: false,
  },
  welcome: {
    es: "/bienvenida",
    en: "/welcome",
    fr: "/bienvenue",
    pt: "/boas-vindas",
    de: "/willkommen",
    it: "/benvenuto",
    indexable: false,
  },
  booking: {
    es: "/reservar/:slug",
    en: "/book/:slug",
    fr: "/reserver/:slug",
    pt: "/agendar/:slug",
    de: "/buchen/:slug",
    it: "/prenota/:slug",
    indexable: false,
  },
  myAppointments: {
    es: "/citas",
    en: "/appointments",
    fr: "/rendez-vous",
    pt: "/agendamentos",
    de: "/termine",
    it: "/appuntamenti",
    indexable: false,
  },
  myAppointment: {
    es: "/citas/:id",
    en: "/appointments/:id",
    fr: "/rendez-vous/:id",
    pt: "/agendamentos/:id",
    de: "/termine/:id",
    it: "/appuntamenti/:id",
    indexable: false,
  },
  dashboard: {
    es: "/panel",
    en: "/dashboard",
    fr: "/tableau-de-bord",
    pt: "/painel",
    de: "/dashboard",
    it: "/pannello",
    indexable: false,
  },
  calendar: {
    es: "/panel/calendarios/:id",
    en: "/dashboard/calendars/:id",
    fr: "/tableau-de-bord/calendriers/:id",
    pt: "/painel/calendarios/:id",
    de: "/dashboard/kalender/:id",
    it: "/pannello/calendari/:id",
    indexable: false,
  },
  calendarSettings: {
    es: "/panel/calendarios/:id/ajustes",
    en: "/dashboard/calendars/:id/settings",
    fr: "/tableau-de-bord/calendriers/:id/parametres",
    pt: "/painel/calendarios/:id/configuracoes",
    de: "/dashboard/kalender/:id/einstellungen",
    it: "/pannello/calendari/:id/impostazioni",
    indexable: false,
  },
  calendarTeam: {
    es: "/panel/calendarios/:id/equipo",
    en: "/dashboard/calendars/:id/team",
    fr: "/tableau-de-bord/calendriers/:id/equipe",
    pt: "/painel/calendarios/:id/equipe",
    de: "/dashboard/kalender/:id/team",
    it: "/pannello/calendari/:id/team",
    indexable: false,
  },
  customers: {
    es: "/panel/clientes",
    en: "/dashboard/customers",
    fr: "/tableau-de-bord/clients",
    pt: "/painel/clientes",
    de: "/dashboard/kunden",
    it: "/pannello/clienti",
    indexable: false,
  },
  inbox: {
    es: "/panel/avisos",
    en: "/dashboard/notifications",
    fr: "/tableau-de-bord/notifications",
    pt: "/painel/notificacoes",
    de: "/dashboard/benachrichtigungen",
    it: "/pannello/notifiche",
    indexable: false,
  },
  account: {
    es: "/panel/cuenta",
    en: "/dashboard/account",
    fr: "/tableau-de-bord/compte",
    pt: "/painel/conta",
    de: "/dashboard/konto",
    it: "/pannello/account",
    indexable: false,
  },
  notificationSettings: {
    es: "/panel/cuenta/avisos",
    en: "/dashboard/account/notifications",
    fr: "/tableau-de-bord/compte/notifications",
    pt: "/painel/conta/notificacoes",
    de: "/dashboard/konto/benachrichtigungen",
    it: "/pannello/account/notifiche",
    indexable: false,
  },
  integrations: {
    es: "/panel/integraciones",
    en: "/dashboard/integrations",
    fr: "/tableau-de-bord/integrations",
    pt: "/painel/integracoes",
    de: "/dashboard/integrationen",
    it: "/pannello/integrazioni",
    indexable: false,
  },
  ai: {
    es: "/panel/ia",
    en: "/dashboard/ai",
    fr: "/tableau-de-bord/ia",
    pt: "/painel/ia",
    de: "/dashboard/ki",
    it: "/pannello/ia",
    indexable: false,
  },
  billing: {
    es: "/panel/facturacion",
    en: "/dashboard/billing",
    fr: "/tableau-de-bord/facturation",
    pt: "/painel/faturamento",
    de: "/dashboard/abrechnung",
    it: "/pannello/fatturazione",
    indexable: false,
  },
  oauthConsent: {
    es: "/oauth/consentimiento",
    en: "/oauth/consent",
    fr: "/oauth/consentement",
    pt: "/oauth/consentimento",
    de: "/oauth/zustimmung",
    it: "/oauth/consenso",
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
  LANGS.map((lang) => ({ id, lang, re: toRegex(ROUTES[id][lang]) })),
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
