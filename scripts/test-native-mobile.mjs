import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const VALID_TARGETS = ["android", "ios", "android-tablet", "ios-tablet"];
const ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Configura los túneles adb reverse para Metro (8081) y el API/Gateway (8080) en todos los dispositivos conectados. */
export function ensureAdbReverse() {
  const adbBin = process.env.ANDROID_HOME ? join(process.env.ANDROID_HOME, "platform-tools/adb") : "adb";
  try {
    const devicesOutput = execSync(`${adbBin} devices`, { encoding: "utf8" });
    const lines = devicesOutput.split("\n").filter((l) => l.includes("\tdevice"));
    for (const line of lines) {
      const serial = line.split("\t")[0].trim();
      if (serial) {
        execSync(`${adbBin} -s ${serial} reverse tcp:8081 tcp:8081`, { stdio: "ignore" });
        execSync(`${adbBin} -s ${serial} reverse tcp:8080 tcp:8080`, { stdio: "ignore" });
      }
    }
  } catch {}
}

/** Selectores (testID) compartidos con services/mobile/src/index.ts → MOBILE_SELECTORS. */
export const NATIVE_SELECTORS = {
  statusBanner: "booking-status-banner",
  googleButton: "auth-google-button",
  emailInput: "auth-email-input",
  passwordInput: "auth-password-input",
  submitButton: "auth-submit-button",
  panelSummaryCard: "panel-summary-card",
  myAppointmentsList: "my-appointments-list",
  signOutButton: "auth-sign-out-button",
};

/** Identifica el serial (udid) del emulador Android correcto cuando hay múltiples emuladores corriendo (teléfono vs tablet). */
export function resolveUdid(target) {
  if (target.startsWith("ios")) return undefined;
  const isTablet = target.endsWith("-tablet");
  const adbBin = process.env.ANDROID_HOME ? join(process.env.ANDROID_HOME, "platform-tools/adb") : "adb";
  try {
    const out = execSync(`${adbBin} devices -l`, { encoding: "utf8" });
    const lines = out.split("\n").filter((l) => l.includes(" device "));
    for (const l of lines) {
      const serial = l.split(/\s+/)[0];
      const hasTablet = l.toLowerCase().includes("tablet");
      if (isTablet && hasTablet) return serial;
      if (!isTablet && !hasTablet) return serial;
    }
  } catch {}
  return undefined;
}

/** Construye capacidades W3C WebDriver / Appium para Android e iOS en teléfono y tablet. */
export function buildNativeCapabilities(target, appPath, options = {}) {
  if (!VALID_TARGETS.includes(target)) {
    throw new Error(`Destino nativo inválido: ${target}. Usa ${VALID_TARGETS.join(", ")}`);
  }
  const isIos = target.startsWith("ios");
  const isTablet = target.endsWith("-tablet");
  const udid = options.udid;
  return {
    platformName: isIos ? "iOS" : "Android",
    "appium:automationName": isIos ? "XCUITest" : "UiAutomator2",
    "appium:deviceName": isIos
      ? isTablet
        ? "iPad Pro 11-inch (M5)"
        : "iPhone 17 Pro"
      : isTablet
        ? "Medium_Tablet"
        : "Pixel_10",
    ...(isIos ? {} : { "appium:avd": isTablet ? "Medium_Tablet" : "Pixel_10" }),
    ...(udid ? { "appium:udid": udid } : {}),
    "appium:app": appPath,
    "appium:newCommandTimeout": 120,
    "appium:autoGrantPermissions": true,
    "mcet:formFactor": isTablet ? "tablet" : "phone",
  };
}

/**
 * Localizador por testID: en Android React Native lo expone como resource-id (sin prefijo de paquete);
 * en iOS como accessibilityIdentifier, que XCUITest busca con «accessibility id».
 */
export function locatorFor(target, testId) {
  return target.startsWith("ios")
    ? { using: "accessibility id", value: testId }
    : { using: "-android uiautomator", value: `new UiSelector().resourceId("${testId}")` };
}

/** Verifica prerrequisitos reales (artefacto compilado y servidor Appium/W3C activo); nunca simula éxito. */
export async function verifyNativePrerequisites({ target, appiumUrl, appPath }) {
  if (!appPath || !existsSync(appPath)) {
    throw new Error(
      `No existe el artefacto nativo para ${target} (define NATIVE_APP_PATH, ANDROID_APP_PATH o IOS_APP_PATH apuntando al .apk o .app de desarrollo).`,
    );
  }
  let response;
  try {
    response = await fetch(`${appiumUrl}/status`, { signal: AbortSignal.timeout(3000) });
  } catch {
    throw new Error(
      `Servidor Appium/WebDriver no disponible en ${appiumUrl}. Inicia Appium y el emulador/simulador para ${target}.`,
    );
  }
  if (!response.ok) {
    throw new Error(`Appium respondió HTTP ${response.status} en ${appiumUrl}/status.`);
  }
}

/**
 * Crea y verifica una cuenta real en el backend (registro móvil + enlace de Mailpit) para que la app
 * pueda iniciar sesión con correo y contraseña. Requiere la pila `pnpm test:env:up`.
 */
export async function prepareNativeAccount({ apiUrl, mailpitUrl, now = Date.now() }) {
  const email = `nativo-${now}@escenarios.test`;
  const password = "una-clave-bien-larga-2026";
  const name = "Prueba Nativa";
  const res = await fetch(`${apiUrl}/api/public/v1/mobile/auth/sign-up`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  if (!res.ok) throw new Error(`Registro de la cuenta nativa falló: HTTP ${res.status}`);

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const search = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages = [] } = await search.json();
    if (messages[0]) {
      const full = await (await fetch(`${mailpitUrl}/api/v1/message/${messages[0].ID}`)).json();
      const link = String(full.Text ?? "")
        .match(/https?:\/\/\S+/g)
        ?.find((u) => u.includes("/api/auth/verify-email"))
        ?.replace(/[)\]>.,]+$/, "");
      if (!link) throw new Error("El correo de verificación no contiene enlace");
      const verify = await fetch(link, { redirect: "manual" });
      if (![200, 302].includes(verify.status)) {
        throw new Error(`Verificación de correo falló: HTTP ${verify.status}`);
      }
      return { email, password, name };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No llegó el correo de verificación para ${email}`);
}

async function driverRequest(appiumUrl, method, path, body, timeoutMs = 60_000) {
  const res = await fetch(`${appiumUrl}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.value?.message ? `: ${String(data.value.message).split("\n")[0]}` : "";
    throw new Error(`Error W3C WebDriver (${method} ${path}): HTTP ${res.status}${detail}`);
  }
  return data;
}

/** Espera a que aparezca un elemento por testID (y opcionalmente a que su texto cumpla una condición). */
async function waitFor(ctx, testId, { textMatches, timeoutMs = 30_000 } = {}) {
  const { appiumUrl, sessionId, target } = ctx;
  const deadline = Date.now() + timeoutMs;
  let lastText = "";
  while (Date.now() < deadline) {
    try {
      const found = await driverRequest(
        appiumUrl,
        "POST",
        `/session/${sessionId}/element`,
        locatorFor(target, testId),
      );
      const elementId = found?.value?.[ELEMENT_KEY] ?? found?.value?.ELEMENT;
      if (elementId) {
        if (!textMatches) return { elementId, text: "" };
        const t = await driverRequest(appiumUrl, "GET", `/session/${sessionId}/element/${elementId}/text`);
        lastText = String(t?.value ?? "");
        if (textMatches(lastText)) return { elementId, text: lastText };
      }
    } catch {
      // aún no está en pantalla
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Elemento «${testId}» no apareció en ${target} en ${timeoutMs} ms${lastText ? ` (último texto: «${lastText}»)` : ""}`,
  );
}

async function tap(ctx, testId) {
  const { elementId } = await waitFor(ctx, testId);
  await driverRequest(ctx.appiumUrl, "POST", `/session/${ctx.sessionId}/element/${elementId}/click`, {});
}

async function type(ctx, testId, text) {
  const { elementId } = await waitFor(ctx, testId);
  await driverRequest(ctx.appiumUrl, "POST", `/session/${ctx.sessionId}/element/${elementId}/clear`, {});
  await driverRequest(ctx.appiumUrl, "POST", `/session/${ctx.sessionId}/element/${elementId}/value`, {
    text,
    value: [...text],
  });
}

async function screenshot(ctx, name) {
  if (!ctx.screenshotDir) return;
  const shot = await driverRequest(ctx.appiumUrl, "GET", `/session/${ctx.sessionId}/screenshot`);
  if (typeof shot?.value !== "string" || !shot.value) return;
  mkdirSync(ctx.screenshotDir, { recursive: true });
  writeFileSync(join(ctx.screenshotDir, `${ctx.target}-${name}.png`), Buffer.from(shot.value, "base64"));
}

/**
 * Recorrido nativo real sobre la app instalada en el emulador/simulador:
 * arranque conectado al backend → botón de Google visible → acceso con correo y contraseña →
 * resumen del panel con el nombre de la cuenta → «Mis citas» cargada → cierre de sesión.
 */
export async function runNativeFlowWithDriver({ target, appiumUrl, appPath, account, screenshotDir }) {
  await verifyNativePrerequisites({ target, appiumUrl, appPath });
  if (!account?.email || !account?.password) {
    throw new Error("Falta la cuenta de prueba (email y contraseña) para el recorrido nativo.");
  }
  const udid = resolveUdid(target);
  const capabilities = buildNativeCapabilities(target, appPath, { udid });
  const created = await driverRequest(
    appiumUrl,
    "POST",
    "/session",
    { capabilities: { alwaysMatch: capabilities, firstMatch: [{}] } },
    240_000,
  );
  const sessionId = created?.value?.sessionId ?? created?.sessionId;
  if (!sessionId) throw new Error(`No se pudo abrir sesión W3C WebDriver para ${target}`);
  const ctx = { target, appiumUrl, sessionId, screenshotDir };
  const steps = [];

  if (!target.startsWith("ios")) {
    ensureAdbReverse();
  }

  try {
    const banner = await waitFor(ctx, NATIVE_SELECTORS.statusBanner, {
      textMatches: (t) => /conectad|connected/i.test(t),
      timeoutMs: 90_000,
    });
    steps.push(`arranque: ${banner.text}`);
    await screenshot(ctx, "1-inicio");

    await waitFor(ctx, NATIVE_SELECTORS.googleButton);
    steps.push("botón de Google visible");

    await type(ctx, NATIVE_SELECTORS.emailInput, account.email);
    await type(ctx, NATIVE_SELECTORS.passwordInput, account.password);
    await tap(ctx, NATIVE_SELECTORS.submitButton);

    const summary = await waitFor(ctx, NATIVE_SELECTORS.panelSummaryCard, {
      textMatches: (t) => t.includes(account.name ?? account.email),
      timeoutMs: 30_000,
    });
    steps.push(`resumen del panel: ${summary.text}`);

    const list = await waitFor(ctx, NATIVE_SELECTORS.myAppointmentsList, {
      textMatches: (t) => t.trim().length > 0,
    });
    steps.push(`mis citas: ${list.text}`);
    await screenshot(ctx, "2-sesion");

    await tap(ctx, NATIVE_SELECTORS.signOutButton);
    await waitFor(ctx, NATIVE_SELECTORS.submitButton);
    steps.push("sesión cerrada");
    await screenshot(ctx, "3-salida");

    return { ok: true, target, sessionId, steps };
  } finally {
    await driverRequest(appiumUrl, "DELETE", `/session/${sessionId}`).catch(() => undefined);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  if (process.env.CI) {
    console.log("Las pruebas nativas móviles están excluidas de CI y requieren simulador/emulador local.");
    process.exit(0);
  }
  const targets = process.argv.slice(2).filter((arg) => VALID_TARGETS.includes(arg));
  if (!targets.length) {
    console.error(`Indica uno o más destinos: ${VALID_TARGETS.join(", ")}`);
    process.exit(1);
  }
  const appiumUrl = process.env.APPIUM_URL ?? "http://127.0.0.1:4723";
  const apiUrl = process.env.NATIVE_API_URL ?? "http://micitaentiempo.localhost:8080";
  const mailpitUrl = process.env.MAILPIT_URL ?? "http://localhost:8025";
  const screenshotDir = join(ROOT, "tests/escenarios/test-results-native");
  let failed = false;
  for (const target of targets) {
    const appPath = target.startsWith("ios")
      ? (process.env.IOS_APP_PATH ?? process.env.NATIVE_APP_PATH ?? "")
      : (process.env.ANDROID_APP_PATH ?? process.env.NATIVE_APP_PATH ?? "");
    try {
      await verifyNativePrerequisites({ target, appiumUrl, appPath });
      const account = await prepareNativeAccount({ apiUrl, mailpitUrl });
      const result = await runNativeFlowWithDriver({ target, appiumUrl, appPath, account, screenshotDir });
      console.log(`✓ [${target}] recorrido nativo completo`);
      for (const step of result.steps) console.log(`    · ${step}`);
    } catch (err) {
      failed = true;
      console.error(`✗ [${target}] ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`Capturas en ${screenshotDir}`);
  process.exit(failed ? 1 : 0);
}
