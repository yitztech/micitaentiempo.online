import { isLang, matchRoute, pathFor, ROUTES } from "@mcet/i18n";
import interLatin from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  redirect,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";
import type { Route } from "./+types/root";
import "./app.css";
import { features } from "./lib/api.server";
import { catalog } from "./lib/catalog.server";
import { nonceContext, siteContext } from "./lib/context";
import { messages } from "./lib/i18n";
import { newNonce } from "./lib/security.server";
import { siteConfig, siteForRequest } from "./lib/site.server";

export const middleware: Route.MiddlewareFunction[] = [
  async ({ request, context }, next) => {
    const site = siteForRequest(request);
    // Una ruta del otro idioma responde 301 a su par en el mismo dominio (07-frontend.md §7.2).
    const url = new URL(request.url);
    const m = matchRoute(url.pathname);
    if (m && m.lang !== site.lang && ROUTES[m.id].es !== ROUTES[m.id].en) {
      throw redirect(`${pathFor(m.id, site.lang, m.params)}${url.search}`, 301);
    }
    context.set(siteContext, site);
    context.set(nonceContext, newNonce());
    return next();
  },
];

export const links: Route.LinksFunction = () => [
  { rel: "preload", href: interLatin, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
];

/** Cookie de sesión de Better Auth (prefijo `mcet`, con __Secure- en HTTPS). */
const SESSION_COOKIE = /(?:^|;\s*)(?:__Secure-)?mcet\.session_token=/;

export async function loader({ context, request }: Route.LoaderArgs) {
  const site = context.get(siteContext);
  const config = siteConfig();
  return {
    site: { ...site, primaryLang: config.primary },
    t: catalog(site.lang),
    features: await features(request),
    hasSession: SESSION_COOKIE.test(request.headers.get("cookie") ?? ""),
    nonce: context.get(nonceContext),
    umami:
      process.env.UMAMI_SCRIPT_URL && process.env.UMAMI_WEBSITE_ID
        ? { src: process.env.UMAMI_SCRIPT_URL, id: process.env.UMAMI_WEBSITE_ID }
        : null,
  };
}

/** El idioma, el catálogo y las funciones no cambian al navegar dentro del mismo dominio. */
export function shouldRevalidate() {
  return false;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const lang = data && isLang(data.site.lang) ? data.site.lang : "es";
  const nonce = data?.nonce;
  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#1d6f86" />
        <Meta />
        <Links />
        {data?.umami ? (
          <script defer src={data.umami.src} data-website-id={data.umami.id} nonce={nonce} />
        ) : null}
      </head>
      <body className="min-h-dvh bg-background text-text antialiased">
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const data = useRouteLoaderData<typeof loader>("root");
  const lang = data && isLang(data.site.lang) ? data.site.lang : "es";
  const t = messages(lang);
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const status = isRouteErrorResponse(error) ? error.status : 500;
  return (
    <main id="contenido" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-24 text-center">
      <p className="text-sm font-medium text-muted tabular">{status}</p>
      <h1 className="mt-2 text-3xl font-semibold">{notFound ? t.errors.notFoundTitle : t.errors.serverTitle}</h1>
      <p className="mt-3 text-muted">{notFound ? t.errors.notFoundBody : t.errors.serverBody}</p>
      <a
        className="mx-auto mt-8 inline-flex min-h-11 items-center rounded-[var(--radius-field)] bg-primary px-5 font-medium text-on-primary hover:bg-primary-hover"
        href={pathFor("home", lang)}
      >
        {t.errors.backHome}
      </a>
    </main>
  );
}
