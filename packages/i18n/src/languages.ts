export const LANGS = ["es", "en", "fr", "pt", "de", "it"] as const;
export type Lang = (typeof LANGS)[number];

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

/** Región por defecto para formatear fechas y números en cada idioma. */
export const DEFAULT_LOCALE: Record<Lang, string> = {
  es: "es-ES",
  en: "en-US",
  fr: "fr-FR",
  pt: "pt-BR",
  de: "de-DE",
  it: "it-IT",
};
