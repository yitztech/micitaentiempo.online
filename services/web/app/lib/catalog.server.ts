import { authEn, authEs, en, es, type Lang, publicEn, publicEs } from "@mcet/i18n";

/**
 * Catálogo de la interfaz por idioma. Viaja en los datos del loader raíz (una sola vez por página),
 * así el JavaScript de cada página no carga los textos de los dos idiomas.
 */
const CATALOG = {
  es: { common: es, public: publicEs, auth: authEs },
  en: { common: en, public: publicEn, auth: authEn },
};

export type Catalog = (typeof CATALOG)["es"];

export function catalog(lang: Lang): Catalog {
  return CATALOG[lang];
}
