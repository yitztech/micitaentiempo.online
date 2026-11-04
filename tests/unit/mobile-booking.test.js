import { describe, expect, it, vi } from "vitest";
import {
  createBookingFlow,
  MOBILE_LANGUAGES,
  MOBILE_STRINGS,
  resolveBookingUrl,
} from "../../services/mobile/src/index.ts";

const SITE = "https://micitaentiempo.online";
const target = (slug, overrides = {}) => ({
  calendarId: `019a0000-0000-7000-8000-0000000e0${slug.length}01`,
  locationId: "019a0000-0000-7000-8000-0000000e0002",
  slug,
  bookingUrl: `/c/${slug}`,
  reservable: true,
  ...overrides,
});

describe("validación del destino de reserva (R01)", () => {
  it("construye la ruta real de reserva en el idioma de la app a partir del slug", () => {
    const t = target("consultas-ana");
    expect(resolveBookingUrl({ target: t, siteUrl: SITE, lang: "es" })).toBe(
      `${SITE}/reservar/consultas-ana`,
    );
    expect(resolveBookingUrl({ target: t, siteUrl: SITE, lang: "en" })).toBe(`${SITE}/book/consultas-ana`);
    expect(resolveBookingUrl({ target: t, siteUrl: `${SITE}/`, lang: "fr" })).toBe(
      `${SITE}/fr/reserver/consultas-ana`,
    );
  });

  it("acepta una URL absoluta del propio sitio, con la forma corta o con la ruta traducida", () => {
    for (const bookingUrl of [
      `${SITE}/c/consultas-ana`,
      `${SITE}/reservar/consultas-ana`,
      `${SITE}/book/consultas-ana`,
    ]) {
      expect(
        resolveBookingUrl({ target: target("consultas-ana", { bookingUrl }), siteUrl: SITE, lang: "es" }),
      ).toBe(`${SITE}/reservar/consultas-ana`);
    }
  });

  it("en desarrollo local permite http en localhost, respetando el puerto", () => {
    const site = "http://micitaentiempo.localhost:8080";
    expect(resolveBookingUrl({ target: target("consultas-ana"), siteUrl: site, lang: "es" })).toBe(
      `${site}/reservar/consultas-ana`,
    );
    expect(
      resolveBookingUrl({
        target: target("consultas-ana", {
          bookingUrl: "http://micitaentiempo.localhost:9999/c/consultas-ana",
        }),
        siteUrl: site,
        lang: "es",
      }),
    ).toBeNull();
  });

  it("rechaza hosts ajenos, esquemas peligrosos, credenciales, consultas y rutas que no son de reserva", () => {
    const malas = [
      "https://evil.example/c/consultas-ana",
      "https://micitaentiempo.online.evil.example/c/consultas-ana",
      "https://micitaentiempo.online@evil.example/c/consultas-ana",
      "https://user:pass@micitaentiempo.online/c/consultas-ana",
      "http://micitaentiempo.online/c/consultas-ana",
      "https://micitaentiempo.online:8443/c/consultas-ana",
      "//evil.example/c/consultas-ana",
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "intent://scan#Intent;scheme=zxing;end",
      "file:///etc/passwd",
      "micitaentiempo://c/consultas-ana",
      "/c/consultas-ana?next=https://evil.example",
      "/c/consultas-ana#x",
      "/c/consultas-ana\\..\\admin",
      "/c/otro-calendario",
      "/precios",
      "/panel/calendarios/1",
      "/c/consultas-ana/../../admin",
      "",
    ];
    for (const bookingUrl of malas) {
      expect(
        resolveBookingUrl({ target: target("consultas-ana", { bookingUrl }), siteUrl: SITE, lang: "es" }),
        bookingUrl,
      ).toBeNull();
    }
  });

  it("rechaza slugs con formato inválido y sitios mal configurados", () => {
    for (const slug of [
      "AB",
      "ab",
      "Consultas",
      "con sultas",
      "-abc",
      "abc-",
      "a--bc",
      "../etc",
      "x".repeat(61),
    ]) {
      expect(
        resolveBookingUrl({ target: target(slug, { bookingUrl: `/c/${slug}` }), siteUrl: SITE, lang: "es" }),
        slug,
      ).toBeNull();
    }
    for (const siteUrl of [
      "",
      "ftp://micitaentiempo.online",
      "http://micitaentiempo.online",
      "micitaentiempo.online",
      `${SITE}/ruta`,
    ]) {
      expect(resolveBookingUrl({ target: target("consultas-ana"), siteUrl, lang: "es" }), siteUrl).toBeNull();
    }
  });
});

describe("recorrido de reserva con el navegador seguro (R01 + R02)", () => {
  function setup({ online = true, signedIn = true, bookings = [[], []], browserError = null } = {}) {
    const calls = { opened: [], listed: 0 };
    const lists = [...bookings];
    const state = { online, signedIn };
    const flow = createBookingFlow(() => ({
      siteUrl: SITE,
      lang: "es",
      isOnline: () => state.online,
      openBrowser: async (url) => {
        calls.opened.push(url);
        if (browserError) throw browserError;
      },
      listBookings: async () => {
        calls.listed++;
        if (!state.signedIn) return null;
        const next = lists.shift();
        if (next instanceof Error) throw next;
        return next ?? [];
      },
    }));
    return { flow, calls, state };
  }

  it("elegir dos destinos distintos mantiene el correcto y abre solo su página", async () => {
    const { flow, calls } = setup();
    const a = target("consultas-ana");
    const b = target("estudio-bea", { calendarId: "019a0000-0000-7000-8000-0000000e0999" });
    flow.select("biz-1", a);
    flow.select("biz-1", b);
    expect(flow.intent()).toMatchObject({
      slug: "estudio-bea",
      calendarId: b.calendarId,
      locationId: b.locationId,
    });
    flow.select("biz-1", a);
    await flow.open();
    expect(calls.opened).toEqual([`${SITE}/reservar/consultas-ana`]);
  });

  it("un destino no reservable o con enlace inválido no inicia reserva ni deja intención", async () => {
    const { flow, calls } = setup();
    flow.select("biz-1", target("consultas-ana"));
    expect(flow.select("biz-1", target("estudio-bea", { reservable: false }))).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(flow.intent()).toBeNull();
    expect(await flow.open()).toEqual({ status: "no_selection" });
    expect(
      flow.select("biz-1", target("estudio-bea", { bookingUrl: "https://evil.example/c/estudio-bea" })),
    ).toEqual({
      ok: false,
      reason: "invalid_link",
    });
    expect(await flow.open()).toEqual({ status: "no_selection" });
    expect(calls.opened).toEqual([]);
  });

  it("sin conexión no abre nada ni presenta una reserva confirmada, y conserva la intención", async () => {
    const { flow, calls, state } = setup({ online: false });
    flow.select("biz-1", target("consultas-ana"));
    expect(await flow.open()).toEqual({ status: "offline" });
    expect(calls.opened).toEqual([]);
    expect(flow.intent()?.slug).toBe("consultas-ana");
    state.online = true;
    expect((await flow.open()).status).not.toBe("offline");
    expect(calls.opened).toHaveLength(1);
  });

  it("solo confirma si el servidor lista una cita que antes no existía", async () => {
    const confirmed = setup({ bookings: [[{ id: "a" }], [{ id: "a" }, { id: "b" }]] });
    confirmed.flow.select("biz-1", target("consultas-ana"));
    expect(await confirmed.flow.open()).toEqual({ status: "confirmed", newBookings: 1 });

    // Abrir la página no es reservar: si no hay cita nueva (plaza ocupada, abandono), no se confirma nada.
    const abandoned = setup({ bookings: [[{ id: "a" }], [{ id: "a" }]] });
    abandoned.flow.select("biz-1", target("consultas-ana"));
    expect(await abandoned.flow.open()).toEqual({ status: "not_confirmed" });
  });

  it("sin sesión en la app, o si falla la consulta al volver, no afirma nada", async () => {
    const anon = setup({ signedIn: false });
    anon.flow.select("biz-1", target("consultas-ana"));
    expect(await anon.flow.open()).toEqual({ status: "unknown" });

    const failing = setup({ bookings: [[{ id: "a" }], new Error("sin red al volver")] });
    failing.flow.select("biz-1", target("consultas-ana"));
    expect(await failing.flow.open()).toEqual({ status: "unknown" });
  });

  it("si el navegador no se puede abrir lo informa; volver atrás conserva el destino", async () => {
    const { flow } = setup({ browserError: new Error("sin navegador") });
    flow.select("biz-1", target("consultas-ana"));
    expect(await flow.open()).toEqual({ status: "browser_error" });
    expect(flow.intent()?.slug).toBe("consultas-ana");
    flow.clear();
    expect(flow.intent()).toBeNull();
  });

  it("la intención solo identifica el destino: ninguna credencial viaja en la URL", async () => {
    const { flow, calls } = setup();
    flow.select("biz-1", target("consultas-ana"));
    await flow.open();
    const url = calls.opened[0];
    expect(url).toBe(`${SITE}/reservar/consultas-ana`);
    expect(url).not.toMatch(/[?#=]|token|bearer|password|otp|hold/i);
    expect(Object.keys(flow.intent() ?? {}).sort()).toEqual([
      "businessId",
      "calendarId",
      "locationId",
      "slug",
      "url",
    ]);
  });

  it("una pulsación repetida mientras se reserva no abre dos navegadores", async () => {
    let release;
    const opened = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const flow = createBookingFlow({
      siteUrl: SITE,
      lang: "es",
      isOnline: () => true,
      openBrowser: opened,
      listBookings: async () => [],
    });
    flow.select("biz-1", target("consultas-ana"));
    const first = flow.open();
    const second = flow.open();
    expect(first).toBe(second);
    await vi.waitFor(() => expect(opened).toHaveBeenCalledTimes(1));
    release();
    await first;
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("los textos del recorrido existen en los seis idiomas", () => {
    const keys = [
      "bookingOffline",
      "bookingUnavailable",
      "bookingInvalidLink",
      "bookingBrowserError",
      "bookingConfirmed",
      "bookingNotConfirmed",
      "bookingUnknown",
    ];
    for (const { lang } of MOBILE_LANGUAGES) {
      for (const key of keys) {
        expect(MOBILE_STRINGS[lang][key]?.trim().length, `${lang}.${key}`).toBeGreaterThan(0);
        if (lang !== "es")
          expect(MOBILE_STRINGS[lang][key], `${lang}.${key}`).not.toBe(MOBILE_STRINGS.es[key]);
      }
    }
  });
});
