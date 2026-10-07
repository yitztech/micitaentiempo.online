import { describe, expect, it } from "vitest";
import { langForHost, matchRoute, pathFor, siteConfigFromEnv, translatePath } from "../src/index.ts";

const config = siteConfigFromEnv({
  IDIOMAS: "es,en",
  SITE_URL: "https://micitaentiempo.online",
  SITE_URL_EN: "https://myappointmentontime.online",
});

describe("idioma por dominio", () => {
  it("usa el dominio de cada idioma", () => {
    expect(langForHost("micitaentiempo.online", config)).toBe("es");
    expect(langForHost("myappointmentontime.online", config)).toBe("en");
    expect(langForHost("MyAppointmentOnTime.online:443", config)).toBe("en");
  });
  it("un host desconocido usa el idioma principal", () => {
    expect(langForHost("otro.example", config)).toBe("es");
    expect(langForHost(undefined, config)).toBe("es");
  });
});

describe("rutas traducidas", () => {
  it("relaciona cada ruta con su par", () => {
    expect(translatePath("/citas", "en")).toBe("/appointments");
    expect(translatePath("/pricing", "es")).toBe("/precios");
    expect(translatePath("/reservar/clinica-sol", "en")).toBe("/book/clinica-sol");
    expect(translatePath("/no-existe", "en")).toBeNull();
  });
  it("detecta el idioma de la forma de la ruta", () => {
    expect(matchRoute("/panel/calendarios/abc")).toMatchObject({
      id: "calendar",
      lang: "es",
      params: { id: "abc" },
    });
  });
  it("exige los parámetros", () => {
    expect(() => pathFor("booking", "es")).toThrow();
    expect(pathFor("booking", "en", { slug: "a b" })).toBe("/book/a%20b");
  });
});
