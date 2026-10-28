// Errores del navegador al registro de la plataforma (Bugsink, AUDITORIA INT-07). La DSN llega en
// tiempo de ejecución desde el loader raíz (SENTRY_DSN del servidor); sin ella no se carga nada.
import * as Sentry from "@sentry/react";

let started = false;

export function startErrors(config: { dsn: string; release?: string; environment: string }): void {
  if (started) return;
  started = true;
  Sentry.init({
    dsn: config.dsn,
    release: config.release,
    environment: config.environment,
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
}

export function reportError(error: unknown): void {
  if (started) Sentry.captureException(error);
}
