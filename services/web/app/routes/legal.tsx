import { matchRoute } from "@mcet/i18n";
import { data } from "react-router";
import { Container } from "~/components/ui";
import { siteContext } from "~/lib/context";
import { fmt, useRoot } from "~/lib/i18n";
import { LEGAL_UPDATED, type LegalDoc, legalHtml } from "~/lib/legal.server";
import { metaFor, publicCacheHeaders } from "~/lib/seo";
import type { Route } from "./+types/legal";

const DOCS: Record<string, LegalDoc> = { privacy: "privacy", terms: "terms", credits: "credits" };

export function loader({ request, context }: Route.LoaderArgs) {
  const { lang } = context.get(siteContext);
  const id = matchRoute(new URL(request.url).pathname)?.id ?? "";
  const doc = DOCS[id];
  if (!doc) throw data(null, { status: 404 });
  return { doc, html: legalHtml(lang, doc), updated: LEGAL_UPDATED };
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => {
    const doc = args.loaderData?.doc ?? "privacy";
    const l = t.public.legal;
    return { title: l[`${doc}Title`], description: l[`${doc}Description`] };
  });

export const headers = () => publicCacheHeaders;

export default function Legal({ loaderData }: Route.ComponentProps) {
  const { site, t } = useRoot();
  const l = t.public.legal;
  const updated = new Intl.DateTimeFormat(site.lang === "es" ? "es-MX" : "en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${loaderData.updated}T12:00:00Z`));
  return (
    <Container className="max-w-3xl py-14 sm:py-20">
      <h1 className="text-4xl font-semibold tracking-tight">{l[`${loaderData.doc}Title`]}</h1>
      <p className="mt-3 text-sm text-muted">{fmt(l.updated, { date: updated })}</p>
      <div
        className="prose-legal mt-8"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Markdown propio del repositorio
        dangerouslySetInnerHTML={{ __html: loaderData.html }}
      />
    </Container>
  );
}
