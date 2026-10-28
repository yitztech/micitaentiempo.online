// Registro de errores de la plataforma (Bugsink, AUDITORIA INT-07). Se importa antes que nada en
// main.ts. Sin SENTRY_DSN (local y CI) no hace nada. Sin trazas de rendimiento.
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;
if (dsn)
  Sentry.init({
    dsn,
    release: process.env.RELEASE_SHA,
    environment: process.env.SENTRY_ENVIRONMENT || "production",
    // Sin datos personales: ni usuario, cookies, cabeceras, cuerpos, consultas ni variables locales.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: 0,
  });

/** Manda el error a Bugsink con el id de la petición (el mismo que llevan los logs). */
export function reportError(error: unknown, requestId?: string): void {
  if (!dsn) return;
  Sentry.withScope((scope) => {
    if (requestId) scope.setTag("requestId", requestId);
    Sentry.captureException(error);
  });
}
