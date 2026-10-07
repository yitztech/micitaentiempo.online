import { type Lang, translatePath } from "@mcet/i18n";
import type { MetaDescriptor } from "react-router";
import type { RootData } from "./i18n";

export interface SeoSite {
  lang: Lang;
  other: Lang;
  siteUrl: string;
  otherSiteUrl: string;
  primaryUrl: string;
  primaryLang: Lang;
}

/** canonical en su dominio, hreflang hacia el par y x-default hacia el dominio principal. */
export function alternateLinks(site: SeoSite, pathname: string): MetaDescriptor[] {
  const otherPath = translatePath(pathname, site.other) ?? pathname;
  const samePath = translatePath(pathname, site.lang) ?? pathname;
  const byLang: Record<Lang, string> = {
    [site.lang]: `${site.siteUrl}${samePath}`,
    [site.other]: `${site.otherSiteUrl}${otherPath}`,
  } as Record<Lang, string>;
  return [
    { tagName: "link", rel: "canonical", href: byLang[site.lang] },
    { tagName: "link", rel: "alternate", hrefLang: "es", href: byLang.es },
    { tagName: "link", rel: "alternate", hrefLang: "en", href: byLang.en },
    { tagName: "link", rel: "alternate", hrefLang: "x-default", href: byLang[site.primaryLang] },
  ];
}

interface MatchLike {
  id: string;
  loaderData?: unknown;
}

/** Datos del loader raíz dentro de `meta` (que no puede usar hooks). */
export function rootFromMatches(matches: ReadonlyArray<MatchLike | undefined>): RootData | undefined {
  return matches.find((m) => m?.id === "root")?.loaderData as RootData | undefined;
}

/**
 * Metadatos de una página: título con la marca, descripción, Open Graph por idioma y, en las
 * indexables, canonical + hreflang + x-default. Las no indexables llevan noindex.
 */
export function pageMeta(
  matches: ReadonlyArray<MatchLike | undefined>,
  pathname: string,
  page: { title: string; description?: string; indexable?: boolean; titleIsFull?: boolean },
): MetaDescriptor[] {
  const root = rootFromMatches(matches);
  if (!root) return [{ title: page.title }];
  const brand = root.t.common.site.name;
  const title = page.titleIsFull ? page.title : `${page.title} · ${brand}`;
  const description = page.description ?? root.t.common.site.description;
  const url = `${root.site.siteUrl}${translatePath(pathname, root.site.lang) ?? pathname}`;
  const out: MetaDescriptor[] = [
    { title },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: brand },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:locale", content: root.site.lang === "es" ? "es_MX" : "en_US" },
    { property: "og:locale:alternate", content: root.site.lang === "es" ? "en_US" : "es_MX" },
    { name: "twitter:card", content: "summary" },
  ];
  if (page.indexable === false) out.push({ name: "robots", content: "noindex, nofollow" });
  else out.push(...alternateLinks(root.site, pathname));
  return out;
}

/** Cabeceras de caché de las páginas públicas (microcaché del gateway por Host + ruta). */
export const publicCacheHeaders = { "Cache-Control": "public, max-age=0, s-maxage=60" };

interface PageSeo {
  title: string;
  description?: string;
  indexable?: boolean;
  titleIsFull?: boolean;
}

/** `meta` de una página a partir del catálogo del idioma (que llega en los datos del loader raíz). */
export function metaFor(
  args: { matches: ReadonlyArray<MatchLike | undefined>; location: { pathname: string } },
  pick: (t: RootData["t"]) => PageSeo,
): MetaDescriptor[] {
  const root = rootFromMatches(args.matches);
  if (!root) return [];
  return pageMeta(args.matches, args.location.pathname, pick(root.t));
}
