import { pathFor, ROUTES, type RouteId } from "@mcet/i18n";
import { siteForRequest } from "~/lib/site.server";
import type { Route } from "./+types/sitemap";

/** Páginas públicas ya publicadas; cada fase añade las suyas. */
const PUBLISHED = new Set<RouteId>(["home"]);

/** Un sitemap por dominio: solo las páginas indexables, con su par en el otro idioma. */
export function loader({ request }: Route.LoaderArgs) {
  const site = siteForRequest(request);
  const ids = (Object.keys(ROUTES) as RouteId[]).filter((id) => ROUTES[id].indexable && PUBLISHED.has(id));
  const urls = ids
    .map((id) => {
      const loc = `${site.siteUrl}${pathFor(id, site.lang)}`;
      const alt = `${site.otherSiteUrl}${pathFor(id, site.other)}`;
      return [
        "  <url>",
        `    <loc>${loc}</loc>`,
        `    <xhtml:link rel="alternate" hreflang="${site.lang}" href="${loc}"/>`,
        `    <xhtml:link rel="alternate" hreflang="${site.other}" href="${alt}"/>`,
        "  </url>",
      ].join("\n");
    })
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
