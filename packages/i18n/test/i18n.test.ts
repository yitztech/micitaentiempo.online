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
  it.each([
    ["/privacidad.data", "privacy", "es"],
    ["/privacy.data", "privacy", "en"],
    ["/condiciones.data", "terms", "es"],
    ["/terms.data", "terms", "en"],
    ["/creditos.data", "credits", "es"],
    ["/credits.data", "credits", "en"],
  ])("reconoce las peticiones de navegación a %s", (pathname, id, lang) => {
    expect(matchRoute(pathname)).toMatchObject({ id, lang });
  });
  it("exige los parámetros", () => {
    expect(() => pathFor("booking", "es")).toThrow();
    expect(pathFor("booking", "en", { slug: "a b" })).toBe("/book/a%20b");
    expect(pathFor("booking", "fr", { slug: "clinique" })).toBe("/fr/reserver/clinique");
    expect(pathFor("booking", "pt", { slug: "clinica" })).toBe("/pt/agendar/clinica");
    expect(pathFor("booking", "de", { slug: "klinik" })).toBe("/de/buchen/klinik");
    expect(pathFor("booking", "it", { slug: "clinica" })).toBe("/it/prenota/clinica");
  });
  it("traduce rutas entre todos los idiomas soportados", () => {
    expect(translatePath("/citas", "fr")).toBe("/fr/rendez-vous");
    expect(translatePath("/citas", "pt")).toBe("/pt/agendamentos");
    expect(translatePath("/citas", "de")).toBe("/de/termine");
    expect(translatePath("/citas", "it")).toBe("/it/appuntamenti");
    expect(translatePath("/tarifs", "es")).toBe("/precios");
    expect(translatePath("/fr/tarifs", "es")).toBe("/precios");
    expect(translatePath("/preise", "it")).toBe("/it/prezzi");
    expect(translatePath("/de/preise", "it")).toBe("/it/prezzi");
  });
  it("solo hay dos dominios reales configurados y los demás idiomas usan el dominio en inglés", () => {
    expect(config.siteUrl.es).toBe("https://micitaentiempo.online");
    expect(config.siteUrl.en).toBe("https://myappointmentontime.online");
    expect(config.siteUrl.fr).toBe("https://myappointmentontime.online");
    expect(config.siteUrl.pt).toBe("https://myappointmentontime.online");
    expect(config.siteUrl.de).toBe("https://myappointmentontime.online");
    expect(config.siteUrl.it).toBe("https://myappointmentontime.online");
    expect(config.hosts.size).toBe(2);
  });
});
