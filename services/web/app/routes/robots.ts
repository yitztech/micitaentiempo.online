import { siteForRequest } from "~/lib/site.server";
import type { Route } from "./+types/robots";

export function loader({ request }: Route.LoaderArgs) {
  const site = siteForRequest(request);
  const body = [
    "User-agent: *",
    "Allow: /",
    // Lo privado se excluye con noindex (meta en el HTML y X-Robots-Tag en la API), nunca con
    // Disallow: una URL bloqueada que tiene enlaces se indexa sin leer su noindex (AGENTS.md §9.2)
    "",
    `Sitemap: ${site.siteUrl}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
