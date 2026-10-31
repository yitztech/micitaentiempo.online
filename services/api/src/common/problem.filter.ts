import { isLang, type Lang, panelDe, panelEn, panelEs, panelFr, panelIt, panelPt } from "@mcet/i18n";
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { reportError } from "../sentry.js";

const ERROR_CATALOGS: Record<Lang, Record<string, string>> = {
  es: panelEs.errors,
  en: panelEn.errors,
  fr: panelFr.errors,
  de: panelDe.errors,
  it: panelIt.errors,
  pt: panelPt.errors,
};

/** Errores en application/problem+json (RFC 9457) con un `code` estable. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const req = http.getRequest<FastifyRequest>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const details = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    if (status >= 500) {
      this.logger.error({ err: exception, url: req.url }, "error no controlado");
      // pino-http deja en req.raw.id el id que llevan los logs (genReqId en app.module.ts).
      reportError(exception, String((req.raw as { id?: unknown }).id ?? req.id));
    }

    const appLocale = req.headers["x-app-locale"];
    const lang: Lang = typeof appLocale === "string" && isLang(appLocale) ? appLocale : "es";
    reply.header("Content-Language", lang);

    const code = typeof details.code === "string" ? details.code : String(HttpStatus[status]).toLowerCase();
    const catalog = ERROR_CATALOGS[lang];
    const translated = catalog ? catalog[code] : undefined;
    const title = translated ?? (typeof details.message === "string" ? details.message : HttpStatus[status]);

    void reply
      .status(status)
      .header("Content-Type", "application/problem+json")
      .send({
        type: "about:blank",
        title,
        status,
        code,
        ...(details.errors ? { errors: details.errors } : {}),
        ...(details.conflicts ? { conflicts: details.conflicts } : {}),
      });
  }
}
