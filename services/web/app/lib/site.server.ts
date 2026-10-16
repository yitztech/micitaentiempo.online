import { isLang, type Lang, langForHost, otherLang, type SiteConfig, siteConfigFromEnv } from "@mcet/i18n";

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
  siteUrls: Record<Lang, string>;
}

/** Idioma y URLs para una petición; el idioma lo decide el Host o la preferencia guardada. */
export function siteForRequest(request: Request): SiteContext {
  const config = siteConfig();
  const host = request.headers.get("host");
  const hostLang = langForHost(host, config);

  let lang = hostLang;
  const enHost = config.siteUrl.en ? new URL(config.siteUrl.en).hostname.toLowerCase() : "";
  const reqHost = host ? host.split(":")[0]?.toLowerCase() : "";

  const url = new URL(request.url);

  // Si el host es el de la URL en inglés (que aloja inglés y los idiomas prefijados: fr, pt, de, it)
  if (enHost && reqHost === enHost) {
    const prefixMatch = url.pathname.match(/^\/(fr|pt|de|it)(?:\/|$)/);
    if (prefixMatch && isLang(prefixMatch[1])) {
      lang = prefixMatch[1];
    } else {
      lang = "en";
    }
  } else {
    lang = "es";
  }

  const other = otherLang(lang);
  return {
    lang,
    other,
    siteUrl: config.siteUrl[lang] || config.siteUrl[config.primary],
    otherSiteUrl: config.siteUrl[other] || config.siteUrl.en,
    primaryUrl: config.siteUrl[config.primary],
    siteUrls: config.siteUrl,
  };
}
