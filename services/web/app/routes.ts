import { LANGS, ROUTES, type RouteId } from "@mcet/i18n";
import { index, layout, type RouteConfig, route } from "@react-router/dev/routes";

/** Registra una página en sus rutas traducidas (un id por cada variante distinta, el mismo módulo). */
function page(id: RouteId, file: string) {
  const routesForId = ROUTES[id];
  const paths = new Map<string, string>();
  for (const lang of LANGS) {
    const p = routesForId[lang];
    if (!paths.has(p)) {
      paths.set(p, `${id}-${lang}`);
    }
  }
  return Array.from(paths.entries()).map(([p, routeId]) => route(p, file, { id: routeId }));
}

export default [
  route("healthz", "routes/healthz.ts"),
  route("sitemap.xml", "routes/sitemap.ts"),
  route("robots.txt", "routes/robots.ts"),
  layout("routes/_public.tsx", [
    index("routes/home.tsx"),
    route("fr", "routes/home.tsx", { id: "home-fr" }),
    route("pt", "routes/home.tsx", { id: "home-pt" }),
    route("de", "routes/home.tsx", { id: "home-de" }),
    route("it", "routes/home.tsx", { id: "home-it" }),
    ...page("features", "routes/features.tsx"),
    ...page("pricing", "routes/pricing.tsx"),
    ...page("faq", "routes/faq.tsx"),
    ...page("connectAi", "routes/connect-ai.tsx"),
    ...page("downloadApp", "routes/download.tsx"),
    ...page("businessDirectory", "routes/business-directory.tsx"),
    ...page("businessProfile", "routes/business-profile.tsx"),
    ...page("contact", "routes/contact.tsx"),
    ...page("privacy", "routes/legal.tsx"),
    ...page("terms", "routes/legal.tsx"),
    ...page("credits", "routes/legal.tsx"),
  ]),
  layout("routes/_auth.tsx", [
    ...page("signUp", "routes/sign-up.tsx"),
    ...page("signIn", "routes/sign-in.tsx"),
    ...page("forgotPassword", "routes/forgot-password.tsx"),
    ...page("resetPassword", "routes/reset-password.tsx"),
    ...page("verifyEmail", "routes/verify-email.tsx"),
    ...page("invitation", "routes/invitation.tsx"),
    ...page("oauthConsent", "routes/oauth-consent.tsx"),
  ]),
  layout("routes/_panel.tsx", [
    ...page("dashboard", "routes/dashboard.tsx"),
    ...page("welcome", "routes/welcome.tsx"),
    ...page("calendar", "routes/calendar.tsx"),
    ...page("calendarSettings", "routes/calendar-settings.tsx"),
    ...page("calendarTeam", "routes/calendar-team.tsx"),
    ...page("customers", "routes/customers.tsx"),
    ...page("inbox", "routes/inbox.tsx"),
    ...page("account", "routes/account.tsx"),
    ...page("notificationSettings", "routes/notification-settings.tsx"),
    ...page("billing", "routes/billing.tsx"),
    ...page("ai", "routes/ai.tsx"),
    ...page("businessProfileSettings", "routes/business-profile-settings.tsx"),
  ]),
  ...page("booking", "routes/booking.tsx"),
  ...page("myAppointments", "routes/my-appointments.tsx"),
  route("embed/:slug", "routes/embed.tsx"),
  route("embed.js", "routes/embed-js.ts"),
  route("app.apk", "routes/app-apk.ts"),
  route("micitaentiempo.apk", "routes/app-apk.ts", { id: "micitaentiempo-apk" }),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
