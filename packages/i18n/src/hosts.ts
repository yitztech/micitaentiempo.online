import { isLang, type Lang } from "./languages.ts";

export interface SiteConfig {
  /** Idioma principal (el primero de IDIOMAS). */
  primary: Lang;
  /** URL pública de cada idioma, sin barra final. */
  siteUrl: Record<Lang, string>;
  /** host (sin puerto, en minúsculas) → idioma. */
  hosts: Map<string, Lang>;
}

type Env = Record<string, string | undefined>;

function stripSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function hostOf(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

/**
 * Construye la configuración de dominios desde el entorno de la plataforma:
 * IDIOMAS, SITE_URL (idioma principal), SITE_URL_ES, SITE_URL_EN y, solo en local, HOST_LANG_MAP.
 */
export function siteConfigFromEnv(env: Env): SiteConfig {
  const idiomas = (env.IDIOMAS ?? "es,en")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(isLang);
  const primary: Lang = idiomas[0] ?? "es";
  const esUrl = env.SITE_URL_ES || (primary === "es" ? env.SITE_URL : undefined);
  const enUrl = env.SITE_URL_EN || (primary === "en" ? env.SITE_URL : undefined);
  if (!esUrl || !enUrl) {
    throw new Error("Faltan SITE_URL/SITE_URL_ES y SITE_URL_EN");
  }
  const siteUrl: Record<Lang, string> = { es: stripSlash(esUrl), en: stripSlash(enUrl) };
  const hosts = new Map<string, Lang>([
    [hostOf(siteUrl.es), "es"],
    [hostOf(siteUrl.en), "en"],
  ]);
  for (const pair of (env.HOST_LANG_MAP ?? "").split(",")) {
    const [host, lang] = pair.split(":").map((s) => s.trim().toLowerCase());
    if (host && isLang(lang)) hosts.set(host, lang);
  }
  return { primary, siteUrl, hosts };
}

/** El idioma lo decide el dominio; nunca Accept-Language ni la IP. Host desconocido → principal. */
export function langForHost(host: string | null | undefined, config: SiteConfig): Lang {
  if (!host) return config.primary;
  const name = host.split(":")[0]?.toLowerCase() ?? "";
  return config.hosts.get(name) ?? config.primary;
}

export function otherLang(lang: Lang): Lang {
  return lang === "es" ? "en" : "es";
}
