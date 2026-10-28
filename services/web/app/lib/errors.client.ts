// Errores del navegador al registro de la plataforma (Bugsink, AUDITORIA INT-07). La DSN llega en
// tiempo de ejecución desde el loader raíz (SENTRY_DSN del servidor); sin ella no se hace nada.
// El SDK (~23 KB comprimidos) se descarga solo cuando ocurre el primer error, para no gastar el
// presupuesto de JavaScript de las páginas públicas (RF-20).
type Config = { dsn: string; release?: string; environment: string };

let config: Config | undefined;
let sdk: Promise<(error: unknown) => void> | undefined;

function load() {
  // Solo init y captureException: así el bundler descarta el resto del SDK.
  sdk ??= import("@sentry/react").then(({ init, captureException }) => {
    init({
      ...config,
      // Sin datos personales ni trazas de rendimiento.
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
      },
      tracesSampleRate: 0,
    });
    return (error: unknown) => {
      captureException(error);
    };
  });
  return sdk;
}

export function reportError(error: unknown): void {
  if (!config) return;
  void load().then((capture) => capture(error));
}

export function startErrors(next: Config): void {
  if (config) return;
  config = next;
  window.addEventListener("error", (event) => reportError(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => reportError(event.reason));
}
