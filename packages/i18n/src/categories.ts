import type { Lang } from "./languages.ts";
import de from "./locales/de/common.json" with { type: "json" };
import en from "./locales/en/common.json" with { type: "json" };
import es from "./locales/es/common.json" with { type: "json" };
import fr from "./locales/fr/common.json" with { type: "json" };
import it from "./locales/it/common.json" with { type: "json" };
import pt from "./locales/pt/common.json" with { type: "json" };

const CATEGORY_MAPS: Record<Lang, Record<string, string>> = {
  es: es.businessCategories,
  en: en.businessCategories,
  fr: fr.businessCategories,
  pt: pt.businessCategories,
  de: de.businessCategories,
  it: it.businessCategories,
};

export function categoryLabel(code: string, lang: Lang): string {
  const catalog = CATEGORY_MAPS[lang] ?? CATEGORY_MAPS.es;
  return catalog[code] ?? code;
}
