import { siteForRequest } from "~/lib/site.server";
import type { Route } from "./+types/robots";

export function loader({ request }: Route.LoaderArgs) {
  const site = siteForRequest(request);
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /panel",
    "Disallow: /dashboard",
    "Disallow: /embed/",
    "Disallow: /reservar/",
    "Disallow: /book/",
    "Disallow: /oauth/",
    "",
    `Sitemap: ${site.siteUrl}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
