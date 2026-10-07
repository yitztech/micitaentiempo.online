import type { Lang } from "@mcet/i18n";
import { marked } from "marked";
import creditsEn from "~/content/en/credits.md?raw";
import privacyEn from "~/content/en/privacy.md?raw";
import termsEn from "~/content/en/terms.md?raw";
import creditsEs from "~/content/es/credits.md?raw";
import privacyEs from "~/content/es/privacy.md?raw";
import termsEs from "~/content/es/terms.md?raw";

export type LegalDoc = "privacy" | "terms" | "credits";

/** Fecha de la última revisión de los textos legales (se actualiza al cambiarlos). */
export const LEGAL_UPDATED = "2026-10-07";

const SOURCES: Record<Lang, Record<LegalDoc, string>> = {
  es: { privacy: privacyEs, terms: termsEs, credits: creditsEs },
  en: { privacy: privacyEn, terms: termsEn, credits: creditsEn },
};

const cache = new Map<string, string>();

/** HTML del documento (contenido propio del repositorio; se convierte una vez en el servidor). */
export function legalHtml(lang: Lang, doc: LegalDoc): string {
  const key = `${lang}:${doc}`;
  let html = cache.get(key);
  if (!html) {
    html = marked.parse(SOURCES[lang][doc], { async: false }) as string;
    html = html.replace(/<a href="https:/g, '<a rel="noopener" href="https:');
    cache.set(key, html);
  }
  return html;
}
