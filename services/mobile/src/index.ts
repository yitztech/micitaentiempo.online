import authEn from "../../../packages/i18n/src/locales/en/auth.json" with { type: "json" };
import bookingEn from "../../../packages/i18n/src/locales/en/booking.json" with { type: "json" };
import commonEn from "../../../packages/i18n/src/locales/en/common.json" with { type: "json" };
import panelEn from "../../../packages/i18n/src/locales/en/panel.json" with { type: "json" };
import authEs from "../../../packages/i18n/src/locales/es/auth.json" with { type: "json" };
import bookingEs from "../../../packages/i18n/src/locales/es/booking.json" with { type: "json" };
import commonEs from "../../../packages/i18n/src/locales/es/common.json" with { type: "json" };
import panelEs from "../../../packages/i18n/src/locales/es/panel.json" with { type: "json" };
import type {
  ConfirmHold,
  MobileGoogleAuth,
  MobileSignIn,
  MobileSignUp,
  PublicHold,
} from "../../../packages/schemas/dist/index.js";
import { validateRequest } from "../../web/app/lib/validation.ts";
import appJson from "../app.json" with { type: "json" };

export type MobilePlatform = "android" | "ios";
export type MobileLang = "es" | "en";

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
  submitButton: "auth-submit-button",
  firstSlotButton: "booking-slot-first",
  confirmBookingButton: "booking-confirm-button",
  statusBanner: "booking-status-banner",
  cancelBookingButton: "my-appointments-cancel-button",
  panelSummaryCard: "panel-summary-card",
  myAppointmentsList: "my-appointments-list",
  signOutButton: "auth-sign-out-button",
} as const;

/** Textos propios de la app nativa (estado de conexión) que no existen en la web. */
export const MOBILE_STRINGS = {
  es: {
    connecting: "Conectando con el servidor…",
    connected: "Conectado al servidor",
    offline: "Sin conexión con el servidor",
    signInError: "No pudimos iniciar sesión. Revisa tu correo y contraseña.",
    googleUnavailable: "El acceso con Google no está configurado en este servidor.",
    noOrg: "Sin negocio",
  },
  en: {
    connecting: "Connecting to server…",
    connected: "Connected to server",
    offline: "Cannot reach the server",
    signInError: "We couldn't sign you in. Check your email and password.",
    googleUnavailable: "Google sign-in is not configured on this server.",
    noOrg: "No business",
  },
} as const;

const CATALOGS = {
  es: { common: commonEs, auth: authEs, booking: bookingEs, panel: panelEs },
  en: { common: commonEn, auth: authEn, booking: bookingEn, panel: panelEn },
} as const;

export function getCatalog(lang: MobileLang) {
  return CATALOGS[lang];
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
  const t = CATALOGS[lang];
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
