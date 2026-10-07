import { expect } from "@playwright/test";
import { idioma, sitio, Then, When } from "../fixtures/sitio";

When(
  "se consulta {string} en el dominio {string}",
  async ({ request, estado }, ruta: string, dominio: string) => {
    const res = await request.get(`${sitio[idioma(dominio)]}${ruta}`, { maxRedirects: 0 });
    estado.status = res.status();
    estado.body = await res.text();
  },
);

Then("la respuesta tiene estado {int}", ({ estado }, codigo: number) => {
  expect(estado.status).toBe(codigo);
});

Then("la respuesta JSON tiene el campo {string}", ({ estado }, campo: string) => {
  const json = JSON.parse(String(estado.body)) as Record<string, unknown>;
  expect(json[campo], `campo ${campo}`).toBeTruthy();
});

Then("la respuesta contiene {string}", ({ estado }, texto: string) => {
  expect(String(estado.body)).toContain(texto);
});
