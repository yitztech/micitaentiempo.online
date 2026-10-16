import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import {
  buildNativeCapabilities,
  locatorFor,
  NATIVE_SELECTORS,
  runNativeFlowWithDriver,
  verifyNativePrerequisites,
} from "../../scripts/test-native-mobile.mjs";

// Estas pruebas validan el ADAPTADOR W3C contra un servidor falso. No sustituyen la ejecución real
// en emulador/simulador (`pnpm test:native:*`).
describe("runner nativo W3C WebDriver / Appium para Android e iOS (teléfonos y tablets)", () => {
  it("construye capacidades W3C para teléfonos y tablets en Android (UiAutomator2) e iOS (XCUITest)", () => {
    const androidPhone = buildNativeCapabilities("android", "/tmp/app.apk");
    expect(androidPhone.platformName).toBe("Android");
    expect(androidPhone["appium:automationName"]).toBe("UiAutomator2");
    expect(androidPhone["appium:avd"]).toBe("Pixel_10");
    expect(androidPhone["mcet:formFactor"]).toBe("phone");

    const androidTablet = buildNativeCapabilities("android-tablet", "/tmp/app.apk");
    expect(androidTablet.platformName).toBe("Android");
    expect(androidTablet["appium:avd"]).toBe("Medium_Tablet");
    expect(androidTablet["mcet:formFactor"]).toBe("tablet");

    const iosPhone = buildNativeCapabilities("ios", "/tmp/App.app");
    expect(iosPhone.platformName).toBe("iOS");
    expect(iosPhone["appium:automationName"]).toBe("XCUITest");
    expect(iosPhone["appium:avd"]).toBeUndefined();
    expect(iosPhone["mcet:formFactor"]).toBe("phone");

    const iosTablet = buildNativeCapabilities("ios-tablet", "/tmp/App.app");
    expect(iosTablet.platformName).toBe("iOS");
    expect(iosTablet["mcet:formFactor"]).toBe("tablet");
  });

  it("localiza por testID: resource-id en Android y accessibility id en iOS", () => {
    expect(locatorFor("android", "auth-google-button")).toEqual({
      using: "-android uiautomator",
      value: 'new UiSelector().resourceId("auth-google-button")',
    });
    expect(locatorFor("ios-tablet", "auth-google-button")).toEqual({
      using: "accessibility id",
      value: "auth-google-button",
    });
  });

  it("falla claramente cuando falta el artefacto nativo o el servidor Appium y nunca simula éxito", async () => {
    await expect(
      verifyNativePrerequisites({ target: "ios", appiumUrl: "http://127.0.0.1:59999", appPath: "" }),
    ).rejects.toThrow(/artefacto nativo|NATIVE_APP_PATH/i);
    await expect(
      verifyNativePrerequisites({
        target: "android",
        appiumUrl: "http://127.0.0.1:59999",
        appPath: __filename,
      }),
    ).rejects.toThrow(/Appium/);
  });

  it("recorre arranque, Google visible, acceso, resumen, «Mis citas» y salida contra un servidor W3C", async () => {
    const actions = [];
    const typed = [];
    const server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => {
        raw += c;
      });
      req.on("end", () => {
        const body = raw ? JSON.parse(raw) : {};
        actions.push({ method: req.method, url: req.url, body });
        res.writeHead(200, { "content-type": "application/json" });
        if (req.url === "/status") return res.end(JSON.stringify({ value: { ready: true } }));
        if (req.url === "/session" && req.method === "POST") {
          return res.end(JSON.stringify({ value: { sessionId: "sess-1" } }));
        }
        if (req.url?.endsWith("/element") && req.method === "POST") {
          const id = String(body.value).match(/resourceId\("(.+)"\)/)?.[1] ?? body.value;
          return res.end(JSON.stringify({ value: { "element-6066-11e4-a52e-4f735466cecf": `el:${id}` } }));
        }
        if (req.url?.endsWith("/value")) typed.push(body.text);
        if (req.url?.endsWith("/text") && req.method === "GET") {
          const id = decodeURIComponent(req.url.split("/element/")[1].split("/")[0]);
          const texts = {
            [`el:${NATIVE_SELECTORS.statusBanner}`]: "Conectado al servidor",
            [`el:${NATIVE_SELECTORS.panelSummaryCard}`]: "Prueba Nativa · Sin negocio",
            [`el:${NATIVE_SELECTORS.myAppointmentsList}`]: "No tienes citas próximas.",
          };
          return res.end(JSON.stringify({ value: texts[id] ?? "" }));
        }
        return res.end(JSON.stringify({ value: null }));
      });
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    try {
      for (const target of ["android", "ios", "android-tablet", "ios-tablet"]) {
        const result = await runNativeFlowWithDriver({
          target,
          appiumUrl: `http://127.0.0.1:${port}`,
          appPath: __filename,
          account: {
            email: "nativo@escenarios.test",
            password: "una-clave-bien-larga-2026",
            name: "Prueba Nativa",
          },
        });
        expect(result.ok).toBe(true);
        expect(result.target).toBe(target);
        expect(result.steps).toContain("sesión cerrada");
      }
      const clicked = actions.filter((a) => a.url?.endsWith("/click")).map((a) => a.url);
      expect(clicked.some((u) => u.includes(NATIVE_SELECTORS.submitButton))).toBe(true);
      expect(clicked.some((u) => u.includes(NATIVE_SELECTORS.signOutButton))).toBe(true);
      expect(typed).toContain("nativo@escenarios.test");
      expect(actions.some((a) => a.method === "DELETE" && a.url === "/session/sess-1")).toBe(true);
    } finally {
      server.close();
    }
  });

  it("no ejecuta el recorrido sin cuenta de prueba", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ value: { ready: true } }));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    try {
      await expect(
        runNativeFlowWithDriver({
          target: "android",
          appiumUrl: `http://127.0.0.1:${port}`,
          appPath: __filename,
        }),
      ).rejects.toThrow(/cuenta de prueba/);
    } finally {
      server.close();
    }
  });
});
