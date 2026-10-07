import { en, es, interpolate, type Lang } from "@mcet/i18n";
import { useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "~/root";

export type Messages = typeof es;
const COMMON: Record<Lang, Messages> = { es, en };

/** Textos comunes (para el límite de errores, que puede no tener datos del loader raíz). */
export function messages(lang: Lang): Messages {
  return COMMON[lang];
}

export { interpolate as fmt };

export type RootData = Awaited<ReturnType<typeof rootLoader>>;

/** Datos del loader raíz: sitio, catálogo del idioma, funciones activas y nonce. */
export function useRoot(): RootData {
  const data = useRouteLoaderData<typeof rootLoader>("root");
  if (!data) throw new Error("Sin datos del loader raíz");
  return data;
}

/** Catálogo del idioma de la página. */
export function useT() {
  return useRoot().t;
}

/** Une clases condicionales. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
