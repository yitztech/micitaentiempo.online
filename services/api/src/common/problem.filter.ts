import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

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
    if (status >= 500) this.logger.error({ err: exception, url: req.url }, "error no controlado");
    void reply
      .status(status)
      .header("Content-Type", "application/problem+json")
      .send({
        type: "about:blank",
        title: typeof details.message === "string" ? details.message : HttpStatus[status],
        status,
        code: typeof details.code === "string" ? details.code : String(HttpStatus[status]).toLowerCase(),
        ...(details.errors ? { errors: details.errors } : {}),
      });
  }
}
