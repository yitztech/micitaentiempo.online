import { isLang } from "@mcet/i18n";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";
import type { Route } from "./+types/root";
import "./app.css";
import { nonceContext, siteContext } from "./lib/context";
import { messages } from "./lib/i18n";
import { newNonce } from "./lib/security.server";
import { siteConfig, siteForRequest } from "./lib/site.server";

export const middleware: Route.MiddlewareFunction[] = [
  async ({ request, context }, next) => {
    context.set(siteContext, siteForRequest(request));
    context.set(nonceContext, newNonce());
    return next();
  },
];

export async function loader({ context }: Route.LoaderArgs) {
  const site = context.get(siteContext);
  const config = siteConfig();
  return {
    site: { ...site, primaryLang: config.primary },
    nonce: context.get(nonceContext),
    umami:
      process.env.UMAMI_SCRIPT_URL && process.env.UMAMI_WEBSITE_ID
        ? { src: process.env.UMAMI_SCRIPT_URL, id: process.env.UMAMI_WEBSITE_ID }
        : null,
  };
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
        <Meta />
        <Links />
        {data?.umami ? (
          <script defer src={data.umami.src} data-website-id={data.umami.id} nonce={nonce} />
        ) : null}
      </head>
      <body className="min-h-dvh antialiased">
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
  const t = messages(data && isLang(data.site.lang) ? data.site.lang : "es");
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-3xl font-semibold">{notFound ? t.errors.notFoundTitle : t.errors.serverTitle}</h1>
      <p className="mt-3 text-[var(--color-text-muted)]">
        {notFound ? t.errors.notFoundBody : t.errors.serverBody}
      </p>
      <a className="mt-8 inline-block text-[var(--color-primary)] underline" href="/">
        {t.errors.backHome}
      </a>
    </main>
  );
}
