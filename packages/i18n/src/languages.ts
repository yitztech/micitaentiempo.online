export const LANGS = ["es", "en"] as const;
export type Lang = (typeof LANGS)[number];

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

/** Región por defecto para formatear fechas y números en cada idioma. */
export const DEFAULT_LOCALE: Record<Lang, string> = { es: "es-MX", en: "en-US" };
