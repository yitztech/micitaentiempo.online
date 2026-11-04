import { type Lang, pathFor } from "@mcet/i18n";

/** Destino de `/c/<slug>`, el enlace corto que publica la API: la reserva en el idioma del dominio. */
export function bookingLinkTarget(lang: Lang, slug: string, search = ""): string {
  return `${pathFor("booking", lang, { slug })}${search}`;
}
