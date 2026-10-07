import {
  authEn,
  authEs,
  bookingEn,
  bookingEs,
  en,
  es,
  type Lang,
  panelEn,
  panelEs,
  publicEn,
  publicEs,
} from "@mcet/i18n";

/**
 * Catálogo de la interfaz por idioma. Viaja en los datos del loader raíz (una sola vez por página),
 * así el JavaScript de cada página no carga los textos de los dos idiomas.
 */
const CATALOG = {
  es: { common: es, public: publicEs, auth: authEs, panel: panelEs, booking: bookingEs },
  en: { common: en, public: publicEn, auth: authEn, panel: panelEn, booking: bookingEn },
};

export type Catalog = (typeof CATALOG)["es"];

export function catalog(lang: Lang): Catalog {
  return CATALOG[lang];
}
