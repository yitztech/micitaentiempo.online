import { test as base, createBdd } from "playwright-bdd";

export type Idioma = "es" | "en";

/** URLs públicas de cada idioma en el entorno de pruebas. */
export const sitio: Record<Idioma, string> = {
  es: process.env.ES_URL ?? "http://micitaentiempo.localhost:8080",
  en: process.env.EN_URL ?? "http://myappointmentontime.localhost:8080",
};

export function idioma(valor: string): Idioma {
  if (valor === "es" || valor === "en") return valor;
  throw new Error(`Idioma desconocido: ${valor}`);
}

export const test = base.extend<{ estado: Record<string, unknown> }>({
  // biome-ignore lint/correctness/noEmptyPattern: firma de fixtures de Playwright
  estado: async ({}, use) => use({}),
});

export const { Given, When, Then } = createBdd(test);
