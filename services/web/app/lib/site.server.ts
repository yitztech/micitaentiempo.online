import { type Lang, langForHost, otherLang, type SiteConfig, siteConfigFromEnv } from "@mcet/i18n";

let cached: SiteConfig | undefined;

export function siteConfig(): SiteConfig {
  cached ??= siteConfigFromEnv(process.env);
  return cached;
}

export interface SiteContext {
  lang: Lang;
  other: Lang;
  siteUrl: string;
  otherSiteUrl: string;
  primaryUrl: string;
}

/** Idioma y URLs para una petición; el idioma lo decide el Host. */
export function siteForRequest(request: Request): SiteContext {
  const config = siteConfig();
  const host = request.headers.get("host");
  const lang = langForHost(host, config);
  const other = otherLang(lang);
  return {
    lang,
    other,
    siteUrl: config.siteUrl[lang],
    otherSiteUrl: config.siteUrl[other],
    primaryUrl: config.siteUrl[config.primary],
  };
}
