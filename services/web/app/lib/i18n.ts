import { en, es, type Lang } from "@mcet/i18n";

export type Messages = typeof es;
const CATALOGS: Record<Lang, Messages> = { es, en };

export function messages(lang: Lang): Messages {
  return CATALOGS[lang];
}
