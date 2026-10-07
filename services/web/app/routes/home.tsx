import { pathFor, translatePath } from "@mcet/i18n";
import { useLoaderData } from "react-router";
import { siteContext } from "~/lib/context";
import { messages } from "~/lib/i18n";
import { alternateLinks } from "~/lib/seo";
import { siteConfig } from "~/lib/site.server";
import type { Route } from "./+types/home";

export async function loader({ context, request }: Route.LoaderArgs) {
  const site = context.get(siteContext);
  return {
    site: { ...site, primaryLang: siteConfig().primary },
    pathname: new URL(request.url).pathname,
  };
}

export function meta({ loaderData: data }: Route.MetaArgs) {
  if (!data) return [];
  const t = messages(data.site.lang);
  return [
    { title: `${t.site.name} — ${t.site.tagline}` },
    { name: "description", content: t.site.description },
    { property: "og:title", content: t.site.name },
    { property: "og:description", content: t.site.description },
    { property: "og:locale", content: data.site.lang === "es" ? "es_MX" : "en_US" },
    ...alternateLinks(data.site, data.pathname),
  ];
}

export default function Home() {
  const { site, pathname } = useLoaderData<typeof loader>();
  const t = messages(site.lang);
  const otherHref = `${site.otherSiteUrl}${translatePath(pathname, site.other) ?? pathFor("home", site.other)}`;
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4">
      <header className="flex items-center justify-between py-6">
        <span className="font-semibold text-[var(--color-primary)]">{t.site.name}</span>
        <a
          href={otherHref}
          hrefLang={site.other}
          lang={site.other}
          aria-label={t.language.switchToLabel}
          className="text-sm underline underline-offset-4"
        >
          {t.language.switchTo}
        </a>
      </header>
      <main className="flex flex-1 flex-col justify-center py-16">
        <p className="text-sm font-medium tracking-wide text-[var(--color-secondary)] uppercase">
          {t.home.comingSoon}
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-balance sm:text-5xl">{t.home.title}</h1>
        <p className="mt-5 max-w-2xl text-lg text-[var(--color-text-muted)]">{t.home.lead}</p>
      </main>
    </div>
  );
}
