import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMobileClient,
  getExpoConfig,
  MOBILE_SELECTORS,
  renderMobileInterfaceSnapshot,
  resolveDeviceLayout,
} from "../../services/mobile/src/index.ts";

afterEach(() => vi.unstubAllGlobals());

describe("apps móviles Expo (Android e iOS, teléfonos y tablets)", () => {
  it("define la configuración Expo para iOS y Android con soporte de tablets y esquemas OAuth", () => {
    const cfg = getExpoConfig();
    expect(cfg.expo.slug).toBe("micitaentiempo");
    expect(cfg.expo.scheme).toEqual(["micitaentiempo", "myappointmentontime"]);
    expect(cfg.expo.ios?.bundleIdentifier).toBe("online.micitaentiempo.app");
    expect(cfg.expo.ios?.supportsTablet).toBe(true);
    expect(cfg.expo.android?.package).toBe("online.micitaentiempo.app");
    expect(cfg.expo.android?.intentFilters?.length).toBeGreaterThan(0);
  });

  it("adapta el diseño entre teléfonos (Android/iOS) y tablets (iPad/Android Tablet)", () => {
    const iphone = resolveDeviceLayout({ width: 390, height: 844, platform: "ios" });
    expect(iphone).toEqual({
      platform: "ios",
      formFactor: "phone",
      isTablet: false,
      columns: 1,
      navigationMode: "bottom-tabs",
      masterDetail: false,
    });

    const pixel = resolveDeviceLayout({ width: 412, height: 915, platform: "android" });
    expect(pixel).toEqual({
      platform: "android",
      formFactor: "phone",
      isTablet: false,
      columns: 1,
      navigationMode: "bottom-tabs",
      masterDetail: false,
    });

    const ipad = resolveDeviceLayout({ width: 834, height: 1194, platform: "ios" });
    expect(ipad).toEqual({
      platform: "ios",
      formFactor: "tablet",
      isTablet: true,
      columns: 2,
      navigationMode: "side-rail",
      masterDetail: true,
    });

    const galaxyTab = resolveDeviceLayout({ width: 800, height: 1280, platform: "android" });
    expect(galaxyTab).toEqual({
      platform: "android",
      formFactor: "tablet",
      isTablet: true,
      columns: 2,
      navigationMode: "side-rail",
      masterDetail: true,
    });
  });

  it("conecta el cliente móvil al backend con login de Google, reserva, cancelación y panel", async () => {
    const calls = [];
    const fetchMock = vi.fn(async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method ?? "GET", headers: init.headers, body: init.body });
      const u = String(url);
      if (u.endsWith("/api/public/v1/mobile/bootstrap")) {
        return new Response(
          JSON.stringify({
            lang: "es",
            siteUrl: "http://micitaentiempo.localhost:8080",
            features: { google: true, googleClientId: "google-test-client-id" },
            auth: { schemes: ["micitaentiempo", "myappointmentontime"], googleRedirectPath: "/oauth/google" },
            user: null,
          }),
        );
      }
      if (u.endsWith("/api/public/v1/mobile/auth/google")) {
        return new Response(
          JSON.stringify({
            token: "tok-google-123",
            user: {
              id: "u-1",
              email: "laura@example.com",
              name: "Laura Gómez",
              locale: "es",
              timezone: "America/Mexico_City",
              emailVerified: true,
            },
          }),
        );
      }
      if (u.endsWith("/api/v1/mobile/summary")) {
        return new Response(
          JSON.stringify({
            user: { id: "u-1", email: "laura@example.com", name: "Laura Gómez" },
            org: { id: "org-1", name: "Clínica Sol", plan: "personal", status: "trialing" },
            calendars: [
              { id: "cal-1", slug: "consultas", name: "Consultas", timezone: "America/Mexico_City" },
            ],
          }),
        );
      }
      if (u.includes("/api/public/v1/my/bookings") && u.endsWith("/cancel")) {
        return new Response(JSON.stringify({ id: "bk-1", status: "cancelled" }));
      }
      if (u.includes("/api/public/v1/my/bookings")) {
        return new Response(
          JSON.stringify([
            {
              id: "bk-1",
              start: "2026-09-15T16:00:00Z",
              end: "2026-09-15T16:30:00Z",
              status: "confirmed",
              version: 1,
              service: "Consulta general",
              calendar: {
                name: "Consultas",
                slug: "consultas",
                timezone: "America/Mexico_City",
                address: null,
              },
              cancelMinNoticeMinutes: 0,
            },
          ]),
        );
      }
      return new Response(JSON.stringify({ ok: true }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createMobileClient({
      baseUrl: "http://micitaentiempo.localhost:8080",
      platform: "ios",
    });

    const boot = await client.bootstrap();
    expect(boot.lang).toBe("es");
    expect(boot.features.google).toBe(true);

    const googleSession = await client.signInWithGoogle({
      code: "prueba:laura@example.com",
      redirectUri: "micitaentiempo://oauth/google",
    });
    expect(googleSession.token).toBe("tok-google-123");
    expect(client.getToken()).toBe("tok-google-123");

    const summary = await client.panelSummary();
    expect(summary.org?.name).toBe("Clínica Sol");
    expect(summary.calendars).toHaveLength(1);

    const bookings = await client.myBookings();
    expect(bookings).toHaveLength(1);
    const cancelled = await client.cancelBooking("bk-1", { reason: "Cambio de agenda" });
    expect(cancelled.status).toBe("cancelled");

    // Verifica que las llamadas autenticadas envían Authorization: Bearer
    const summaryCall = calls.find((c) => c.url.endsWith("/api/v1/mobile/summary"));
    expect(summaryCall?.headers).toMatchObject({ authorization: "Bearer tok-google-123" });
  });

  it("reutiliza las interfaces del frontend (acceso con Google, reserva, mis citas y panel) en teléfono y tablet", () => {
    const phoneEs = renderMobileInterfaceSnapshot({
      lang: "es",
      platform: "android",
      width: 390,
      height: 844,
      googleEnabled: true,
    });
    expect(phoneEs.layout.isTablet).toBe(false);
    expect(phoneEs.selectors).toEqual(MOBILE_SELECTORS);
    expect(phoneEs.html).toContain("Continuar con Google");
    expect(phoneEs.html).toContain("Mis citas");
    expect(phoneEs.html).toContain('data-layout="phone"');

    const tabletEn = renderMobileInterfaceSnapshot({
      lang: "en",
      platform: "ios",
      width: 834,
      height: 1194,
      googleEnabled: true,
    });
    expect(tabletEn.layout.isTablet).toBe(true);
    expect(tabletEn.layout.masterDetail).toBe(true);
    expect(tabletEn.html).toContain("Continue with Google");
    expect(tabletEn.html).toContain("My appointments");
    expect(tabletEn.html).toContain('data-layout="tablet"');
  });
});
