import { type Lang, translatePath } from "@mcet/i18n";
import type { MetaDescriptor } from "react-router";

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
