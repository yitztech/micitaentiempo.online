import {
  authDe,
  authEn,
  authEs,
  authFr,
  authIt,
  authPt,
  bookingDe,
  bookingEn,
  bookingEs,
  bookingFr,
  bookingIt,
  bookingPt,
  de,
  en,
  es,
  fr,
  it,
  type Lang,
  noticesDe,
  noticesEn,
  noticesEs,
  noticesFr,
  noticesIt,
  noticesPt,
  panelDe,
  panelEn,
  panelEs,
  panelFr,
  panelIt,
  panelPt,
  pt,
  publicDe,
  publicEn,
  publicEs,
  publicFr,
  publicIt,
  publicPt,
} from "@mcet/i18n";

/**
 * Catálogo de la interfaz por idioma. Viaja en los datos del loader raíz (una sola vez por página),
 * así el JavaScript de cada página no carga los textos de todos los idiomas.
 */
const CATALOG = {
  es: { common: es, public: publicEs, auth: authEs, panel: panelEs, booking: bookingEs, notices: noticesEs },
  en: { common: en, public: publicEn, auth: authEn, panel: panelEn, booking: bookingEn, notices: noticesEn },
  fr: { common: fr, public: publicFr, auth: authFr, panel: panelFr, booking: bookingFr, notices: noticesFr },
  pt: { common: pt, public: publicPt, auth: authPt, panel: panelPt, booking: bookingPt, notices: noticesPt },
  de: { common: de, public: publicDe, auth: authDe, panel: panelDe, booking: bookingDe, notices: noticesDe },
  it: { common: it, public: publicIt, auth: authIt, panel: panelIt, booking: bookingIt, notices: noticesIt },
};

export type Catalog = (typeof CATALOG)["es"];

export function catalog(lang: Lang): Catalog {
  return CATALOG[lang] ?? CATALOG.es;
}
