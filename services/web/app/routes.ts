import { index, layout, type RouteConfig, route } from "@react-router/dev/routes";
import { ROUTES, type RouteId } from "@mcet/i18n";

/** Registra una página en sus dos rutas traducidas (un id por idioma, el mismo módulo). */
function page(id: RouteId, file: string) {
  const { es, en } = ROUTES[id];
  if (es === en) return [route(es, file, { id })];
  return [route(es, file, { id: `${id}-es` }), route(en, file, { id: `${id}-en` })];
}

export default [
  route("healthz", "routes/healthz.ts"),
  route("sitemap.xml", "routes/sitemap.ts"),
  route("robots.txt", "routes/robots.ts"),
  layout("routes/_public.tsx", [
    index("routes/home.tsx"),
    ...page("features", "routes/features.tsx"),
    ...page("pricing", "routes/pricing.tsx"),
    ...page("faq", "routes/faq.tsx"),
    ...page("connectAi", "routes/connect-ai.tsx"),
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
  ]),
  ...page("dashboard", "routes/dashboard.tsx"),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
