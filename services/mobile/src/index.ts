import authDe from "../../../packages/i18n/src/locales/de/auth.json" with { type: "json" };
import bookingDe from "../../../packages/i18n/src/locales/de/booking.json" with { type: "json" };
import commonDe from "../../../packages/i18n/src/locales/de/common.json" with { type: "json" };
import panelDe from "../../../packages/i18n/src/locales/de/panel.json" with { type: "json" };
import authEn from "../../../packages/i18n/src/locales/en/auth.json" with { type: "json" };
import bookingEn from "../../../packages/i18n/src/locales/en/booking.json" with { type: "json" };
import commonEn from "../../../packages/i18n/src/locales/en/common.json" with { type: "json" };
import panelEn from "../../../packages/i18n/src/locales/en/panel.json" with { type: "json" };
import authEs from "../../../packages/i18n/src/locales/es/auth.json" with { type: "json" };
import bookingEs from "../../../packages/i18n/src/locales/es/booking.json" with { type: "json" };
import commonEs from "../../../packages/i18n/src/locales/es/common.json" with { type: "json" };
import panelEs from "../../../packages/i18n/src/locales/es/panel.json" with { type: "json" };
import authFr from "../../../packages/i18n/src/locales/fr/auth.json" with { type: "json" };
import bookingFr from "../../../packages/i18n/src/locales/fr/booking.json" with { type: "json" };
import commonFr from "../../../packages/i18n/src/locales/fr/common.json" with { type: "json" };
import panelFr from "../../../packages/i18n/src/locales/fr/panel.json" with { type: "json" };
import authIt from "../../../packages/i18n/src/locales/it/auth.json" with { type: "json" };
import bookingIt from "../../../packages/i18n/src/locales/it/booking.json" with { type: "json" };
import commonIt from "../../../packages/i18n/src/locales/it/common.json" with { type: "json" };
import panelIt from "../../../packages/i18n/src/locales/it/panel.json" with { type: "json" };
import authPt from "../../../packages/i18n/src/locales/pt/auth.json" with { type: "json" };
import bookingPt from "../../../packages/i18n/src/locales/pt/booking.json" with { type: "json" };
import commonPt from "../../../packages/i18n/src/locales/pt/common.json" with { type: "json" };
import panelPt from "../../../packages/i18n/src/locales/pt/panel.json" with { type: "json" };
import type {
  ConfirmHold,
  MobileForgotPassword,
  MobileGoogleAuth,
  MobileSignIn,
  MobileSignUp,
  PublicHold,
} from "../../../packages/schemas/dist/index.js";
import { validateRequest } from "../../web/app/lib/validation.ts";
import appJson from "../app.json" with { type: "json" };

export type MobilePlatform = "android" | "ios";
export type MobileLang = "es" | "en" | "fr" | "pt" | "de" | "it";

export const MOBILE_LANGUAGES: Array<{ lang: MobileLang; label: string; flag: string }> = [
  { lang: "es", label: "Español", flag: "🇪🇸" },
  { lang: "en", label: "English", flag: "🇺🇸" },
  { lang: "fr", label: "Français", flag: "🇫🇷" },
  { lang: "pt", label: "Português", flag: "🇧🇷" },
  { lang: "de", label: "Deutsch", flag: "🇩🇪" },
  { lang: "it", label: "Italiano", flag: "🇮🇹" },
];

export interface CountryCallingCode {
  code: string;
  name: string;
  flag: string;
  dialCode: string;
}

export const COUNTRIES: CountryCallingCode[] = [
  { code: "ES", name: "España", flag: "🇪🇸", dialCode: "+34" },
  { code: "US", name: "Estados Unidos", flag: "🇺🇸", dialCode: "+1" },
  { code: "BR", name: "Brasil", flag: "🇧🇷", dialCode: "+55" },
  { code: "FR", name: "Francia", flag: "🇫🇷", dialCode: "+33" },
  { code: "DE", name: "Alemania", flag: "🇩🇪", dialCode: "+49" },
  { code: "IT", name: "Italia", flag: "🇮🇹", dialCode: "+39" },
  { code: "MX", name: "México", flag: "🇲🇽", dialCode: "+52" },
  { code: "CO", name: "Colombia", flag: "🇨🇴", dialCode: "+57" },
  { code: "AR", name: "Argentina", flag: "🇦🇷", dialCode: "+54" },
  { code: "CL", name: "Chile", flag: "🇨🇱", dialCode: "+56" },
  { code: "PE", name: "Perú", flag: "🇵🇪", dialCode: "+51" },
  { code: "GB", name: "Reino Unido", flag: "🇬🇧", dialCode: "+44" },
  { code: "PT", name: "Portugal", flag: "🇵🇹", dialCode: "+351" },
  { code: "CA", name: "Canadá", flag: "🇨🇦", dialCode: "+1" },
  { code: "EC", name: "Ecuador", flag: "🇪🇨", dialCode: "+593" },
  { code: "GT", name: "Guatemala", flag: "🇬🇹", dialCode: "+502" },
  { code: "CR", name: "Costa Rica", flag: "🇨🇷", dialCode: "+506" },
  { code: "PA", name: "Panamá", flag: "🇵🇦", dialCode: "+507" },
  { code: "UY", name: "Uruguay", flag: "UY", dialCode: "+598" },
];

export interface DeviceLayout {
  platform: MobilePlatform;
  formFactor: "phone" | "tablet";
  isTablet: boolean;
  columns: 1 | 2;
  navigationMode: "bottom-tabs" | "side-rail";
  masterDetail: boolean;
}

/** Contrato de selectores accesibles compartidos entre Expo (Android/iOS), Web y WebDriver. */
export const MOBILE_SELECTORS = {
  googleButton: "auth-google-button",
  emailInput: "auth-email-input",
  passwordInput: "auth-password-input",
  confirmPasswordInput: "auth-confirm-password-input",
  nameInput: "auth-name-input",
  phoneInput: "auth-phone-input",
  countrySelector: "auth-country-selector",
  submitButton: "auth-submit-button",
  firstSlotButton: "booking-slot-first",
  confirmBookingButton: "booking-confirm-button",
  statusBanner: "booking-status-banner",
  cancelBookingButton: "my-appointments-cancel-button",
  panelSummaryCard: "panel-summary-card",
  myAppointmentsList: "my-appointments-list",
  signOutButton: "auth-sign-out-button",
  tabSignIn: "auth-tab-sign-in",
  tabSignUp: "auth-tab-sign-up",
  tabForgot: "auth-tab-forgot",
  languageSelector: "mobile-language-selector",
} as const;

/** Textos propios de la app nativa (estado de conexión, validación y flujos) en los 6 idiomas. */
export const MOBILE_STRINGS: Record<
  MobileLang,
  {
    connecting: string;
    connected: string;
    offline: string;
    signInError: string;
    googleUnavailable: string;
    noOrg: string;
    signUpSuccess: string;
    forgotSuccess: string;
    phoneLabel: string;
    countryLabel: string;
    selectCountry: string;
    nameError: string;
    emailError: string;
    passwordError: string;
    phoneError: string;
  }
> = {
  es: {
    connecting: "Conectando con el servidor…",
    connected: "Conectado al servidor",
    offline: "Sin conexión con el servidor",
    signInError: "No pudimos iniciar sesión. Revisa tu correo y contraseña.",
    googleUnavailable: "El acceso con Google no está configurado en este servidor.",
    noOrg: "Sin negocio",
    signUpSuccess: "Cuenta creada. Revisa tu correo para confirmarla.",
    forgotSuccess: "Si la cuenta existe, te enviamos un enlace de recuperación a tu correo.",
    phoneLabel: "Teléfono",
    countryLabel: "País",
    selectCountry: "Elige país",
    nameError: "El nombre debe tener entre 2 y 120 caracteres y sin etiquetas.",
    emailError: "El correo no tiene un formato válido (5-254 caracteres).",
    passwordError: "La contraseña debe tener entre 12 y 128 caracteres (mínimo 8 al entrar).",
    phoneError: "El teléfono solo debe contener números (entre 7 y 20 caracteres).",
  },
  en: {
    connecting: "Connecting to server…",
    connected: "Connected to server",
    offline: "Cannot reach the server",
    signInError: "We couldn't sign you in. Check your email and password.",
    googleUnavailable: "Google sign-in is not configured on this server.",
    noOrg: "No business",
    signUpSuccess: "Account created. Check your email to confirm it.",
    forgotSuccess: "If the account exists, we sent a recovery link to your email.",
    phoneLabel: "Phone",
    countryLabel: "Country",
    selectCountry: "Select country",
    nameError: "Name must be between 2 and 120 characters without tags.",
    emailError: "Email format is not valid (5-254 characters).",
    passwordError: "Password must be between 12 and 128 characters (min 8 to sign in).",
    phoneError: "Phone must only contain numbers (between 7 and 20 characters).",
  },
  fr: {
    connecting: "Connexion au serveur…",
    connected: "Connecté au serveur",
    offline: "Pas de connexion avec le serveur",
    signInError: "Impossible de vous connecter. Vérifiez votre e-mail et votre mot de passe.",
    googleUnavailable: "La connexion avec Google n'est pas configurée sur ce serveur.",
    noOrg: "Aucune entreprise",
    signUpSuccess: "Compte créé. Vérifiez votre boîte mail pour confirmer.",
    forgotSuccess: "Si le compte existe, un lien de récupération a été envoyé.",
    phoneLabel: "Téléphone",
    countryLabel: "Pays",
    selectCountry: "Choisir un pays",
    nameError: "Le nom doit comporter entre 2 et 120 caractères sans balises.",
    emailError: "Le format de l'e-mail n'est pas valide (5-254 caractères).",
    passwordError: "Le mot de passe doit comporter entre 12 et 128 caractères.",
    phoneError: "Le téléphone ne doit contenir que des chiffres (7 à 20 caractères).",
  },
  pt: {
    connecting: "Conectando ao servidor…",
    connected: "Conectado ao servidor",
    offline: "Sem conexão com o servidor",
    signInError: "Não foi possível entrar. Verifique seu e-mail e senha.",
    googleUnavailable: "O login com o Google não está configurado neste servidor.",
    noOrg: "Sem negócio",
    signUpSuccess: "Conta criada. Verifique seu e-mail para confirmar.",
    forgotSuccess: "Se a conta existir, enviamos um link de recuperação para o seu e-mail.",
    phoneLabel: "Telefone",
    countryLabel: "País",
    selectCountry: "Selecione o país",
    nameError: "O nome deve ter entre 2 e 120 caracteres sem tags.",
    emailError: "O formato do e-mail não é válido (5-254 caracteres).",
    passwordError: "A senha deve ter entre 12 e 128 caracteres.",
    phoneError: "O telefone deve conter apenas números (entre 7 e 20 caracteres).",
  },
  de: {
    connecting: "Verbindung zum Server wird hergestellt…",
    connected: "Mit Server verbunden",
    offline: "Keine Verbindung zum Server",
    signInError: "Anmeldung fehlgeschlagen. Überprüfen Sie Ihre E-Mail-Adresse und Ihr Passwort.",
    googleUnavailable: "Google-Anmeldung ist auf diesem Server nicht konfiguriert.",
    noOrg: "Kein Unternehmen",
    signUpSuccess: "Konto erstellt. Überprüfen Sie Ihre E-Mails zur Bestätigung.",
    forgotSuccess: "Falls das Konto existiert, wurde ein Link zur Wiederherstellung gesendet.",
    phoneLabel: "Telefon",
    countryLabel: "Land",
    selectCountry: "Land auswählen",
    nameError: "Der Name muss zwischen 2 und 120 Zeichen ohne Tags lang sein.",
    emailError: "E-Mail-Format ist ungültig (5-254 Zeichen).",
    passwordError: "Das Passwort muss zwischen 12 und 128 Zeichen lang sein.",
    phoneError: "Das Telefon darf nur Ziffern enthalten (7 bis 20 Zeichen).",
  },
  it: {
    connecting: "Connessione al server in corso…",
    connected: "Connesso al server",
    offline: "Nessuna connessione con il server",
    signInError: "Accesso non riuscito. Controlla la tua email e password.",
    googleUnavailable: "L'accesso con Google non è configurato su questo server.",
    noOrg: "Nessuna attività",
    signUpSuccess: "Account creato. Controlla la tua email per confermare.",
    forgotSuccess: "Se l'account esiste, abbiamo inviato un link di recupero.",
    phoneLabel: "Telefono",
    countryLabel: "Paese",
    selectCountry: "Scegli il paese",
    nameError: "Il nome deve avere tra 2 e 120 caratteri senza tag.",
    emailError: "Il formato dell'email non è valido (5-254 caratteri).",
    passwordError: "La password deve avere tra 12 e 128 caratteri.",
    phoneError: "Il telefono deve contenere solo numeri (da 7 a 20 caratteri).",
  },
};

const CATALOGS: Record<
  MobileLang,
  {
    common: typeof commonEs;
    auth: typeof authEs;
    booking: typeof bookingEs;
    panel: typeof panelEs;
  }
> = {
  es: { common: commonEs, auth: authEs, booking: bookingEs, panel: panelEs },
  en: { common: commonEn, auth: authEn, booking: bookingEn, panel: panelEn },
  fr: { common: commonFr, auth: authFr, booking: bookingFr, panel: panelFr },
  pt: { common: commonPt, auth: authPt, booking: bookingPt, panel: panelPt },
  de: { common: commonDe, auth: authDe, booking: bookingDe, panel: panelDe },
  it: { common: commonIt, auth: authIt, booking: bookingIt, panel: panelIt },
};

export function getCatalog(lang: MobileLang) {
  return CATALOGS[lang] ?? CATALOGS.es;
}

export function getExpoConfig() {
  return appJson;
}

/** Determina la disposición adaptativa para teléfonos (<768 px) y tablets (>=768 px, iPad y Android Tablet). */
export function resolveDeviceLayout({
  width,
  height,
  platform,
}: {
  width: number;
  height: number;
  platform: MobilePlatform;
}): DeviceLayout {
  const minSide = Math.min(width, height);
  const isTablet = width >= 768 || minSide >= 600;
  return {
    platform,
    formFactor: isTablet ? "tablet" : "phone",
    isTablet,
    columns: isTablet ? 2 : 1,
    navigationMode: isTablet ? "side-rail" : "bottom-tabs",
    masterDetail: isTablet,
  };
}

export interface MobileBootstrapResponse {
  lang: MobileLang;
  siteUrl: string;
  features: {
    google: boolean;
    googleClientId: string | null;
  };
  auth: {
    schemes: string[];
    googleRedirectPath: string;
  };
  user: {
    id: string;
    email: string;
    name: string;
  } | null;
}

export interface MobileAuthSession {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    locale?: MobileLang;
    timezone?: string;
    emailVerified?: boolean;
  };
  twoFactorRedirect?: boolean;
}

export interface MobilePanelSummary {
  user: { id: string; email: string; name: string };
  org: { id: string; name: string; plan: string; status: string } | null;
  calendars: Array<{ id: string; slug: string; name: string; timezone: string }>;
}

/** Cliente HTTP de las apps móviles Expo (Android e iOS) conectado al backend de Mi Cita en Tiempo. */
export function createMobileClient({
  baseUrl,
  platform,
  initialToken = null,
}: {
  baseUrl: string;
  platform: MobilePlatform;
  initialToken?: string | null;
}) {
  let token: string | null = initialToken;
  const cleanBase = baseUrl.replace(/\/$/, "");

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const validated = body === undefined ? undefined : validateRequest(method, path, body);
    const headers: Record<string, string> = {
      accept: "application/json",
      "x-mobile-client": `expo-${platform}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    };
    const res = await fetch(`${cleanBase}${path}`, {
      method,
      headers,
      body: validated === undefined ? undefined : JSON.stringify(validated),
    });
    if (res.status === 204) return {} as T;
    const text = await res.text();
    const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!res.ok) {
      throw {
        status: res.status,
        code: typeof data.code === "string" ? data.code.toLowerCase() : "generic",
        body: data,
      };
    }
    return data as T;
  }

  return {
    getToken: () => token,
    setToken: (next: string | null) => {
      token = next;
    },
    bootstrap: () => request<MobileBootstrapResponse>("GET", "/api/public/v1/mobile/bootstrap"),
    signUp: (input: MobileSignUp, altcha?: string) =>
      request<{ user: { id: string; email: string; name: string } }>(
        "POST",
        "/api/public/v1/mobile/auth/sign-up",
        input,
        altcha ? { "x-altcha": altcha } : {},
      ),
    signIn: async (input: MobileSignIn) => {
      const res = await request<MobileAuthSession>("POST", "/api/public/v1/mobile/auth/sign-in", input);
      if (res.token) token = res.token;
      return res;
    },
    forgotPassword: (input: MobileForgotPassword) =>
      request<{ ok: boolean }>("POST", "/api/public/v1/mobile/auth/forgot-password", input),
    signInWithGoogle: async (input: MobileGoogleAuth) => {
      const res = await request<MobileAuthSession>("POST", "/api/public/v1/mobile/auth/google", input);
      if (res.token) token = res.token;
      return res;
    },
    signOut: async () => {
      await request("POST", "/api/public/v1/mobile/auth/sign-out", {});
      token = null;
    },
    panelSummary: () => request<MobilePanelSummary>("GET", "/api/v1/mobile/summary"),
    publicCalendar: (slug: string) => request("GET", `/api/public/v1/calendars/${encodeURIComponent(slug)}`),
    createHold: (slug: string, input: PublicHold, headers: Record<string, string>) =>
      request("POST", `/api/public/v1/calendars/${encodeURIComponent(slug)}/holds`, input, headers),
    confirmHold: (holdId: string, input: ConfirmHold) =>
      request("POST", `/api/public/v1/holds/${encodeURIComponent(holdId)}/confirm`, input),
    myBookings: (includePast = false) =>
      request<Array<{ id: string; status: string; start: string; end: string }>>(
        "GET",
        `/api/public/v1/my/bookings?includePast=${includePast}`,
      ),
    cancelBooking: (bookingId: string, input: { reason?: string } = {}) =>
      request<{ id: string; status: string }>(
        "POST",
        `/api/public/v1/my/bookings/${encodeURIComponent(bookingId)}/cancel`,
        input,
      ),
  };
}

/**
 * Renderiza la estructura de interfaz compartida entre el frontend web y Expo (Android e iOS)
 * para teléfonos (una columna + pestañas inferiores) y tablets (riel lateral + vista dividida maestro-detalle).
 */
export function renderMobileInterfaceSnapshot({
  lang,
  platform,
  width,
  height,
  googleEnabled = true,
}: {
  lang: MobileLang;
  platform: MobilePlatform;
  width: number;
  height: number;
  googleEnabled?: boolean;
}) {
  const layout = resolveDeviceLayout({ width, height, platform });
  const t = getCatalog(lang);
  const googleButtonHtml = googleEnabled
    ? `<button type="button" data-testid="${MOBILE_SELECTORS.googleButton}" aria-label="${t.auth.google}">${t.auth.google}</button>`
    : "";
  const html = [
    `<div data-platform="${platform}" data-layout="${layout.formFactor}" data-nav="${layout.navigationMode}" data-columns="${layout.columns}">`,
    `<header><h1>${t.common.site.name}</h1><nav aria-label="${t.common.nav.main}"><span>${t.common.nav.myAppointments}</span><span>${t.common.nav.dashboard}</span></nav></header>`,
    `<section aria-label="${t.auth.signIn.title}">${googleButtonHtml}<input name="email" data-testid="${MOBILE_SELECTORS.emailInput}" aria-label="${t.auth.fields.email}" /><input name="password" type="password" data-testid="${MOBILE_SELECTORS.passwordInput}" aria-label="${t.auth.fields.password}" /><button type="submit" data-testid="${MOBILE_SELECTORS.submitButton}">${t.auth.signIn.submit}</button></section>`,
    `<section aria-label="${t.booking.my.title}" data-master-detail="${layout.masterDetail}"><button type="button" data-testid="${MOBILE_SELECTORS.firstSlotButton}">${t.booking.slotStep.continue}</button><button type="button" data-testid="${MOBILE_SELECTORS.confirmBookingButton}">${t.booking.verify.confirm}</button><p data-testid="${MOBILE_SELECTORS.statusBanner}">${t.booking.done.title}</p><button type="button" data-testid="${MOBILE_SELECTORS.cancelBookingButton}">${t.booking.my.cancel}</button></section>`,
    `<section data-testid="${MOBILE_SELECTORS.panelSummaryCard}" aria-label="${t.panel.nav.calendars}"></section>`,
    `</div>`,
  ].join("");

  return {
    layout,
    selectors: MOBILE_SELECTORS,
    catalog: t,
    html,
  };
}
