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

/**
 * Doble de Google Identity Services: los escenarios no salen a Internet. El «popup» devuelve un código
 * que el doble de Google de la captura cambia por un id_token con ese correo (o GSI_CORREO si se fija).
 */
const GSI_DOBLE = `window.google={accounts:{oauth2:{initCodeClient:function(c){return{requestCode:function(){
var correo=window.GSI_CORREO||c.login_hint||"cliente-google@example.com";
setTimeout(function(){c.callback({code:"prueba:"+correo})},50);}}}}}};`;

export const test = base.extend<{ estado: Record<string, unknown> }>({
  context: async ({ context }, use) => {
    await context.route("https://accounts.google.com/gsi/client", (r) =>
      r.fulfill({ contentType: "text/javascript", body: GSI_DOBLE }),
    );
    await use(context);
  },
  // biome-ignore lint/correctness/noEmptyPattern: firma de fixtures de Playwright
  estado: async ({}, use) => use({}),
});

export const { Given, When, Then, After } = createBdd(test);
