import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { requestLang } from "../common/request.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { AuthRegistry, type SessionUser } from "./auth.registry.js";

export const PUBLIC_ROUTE = "mcet:public";
/** Marca un endpoint como público (sin sesión). */
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

export type AuthedRequest = FastifyRequest & { user?: SessionUser; sessionId?: string };

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Exige sesión en /api/v1 y protege las mutaciones contra CSRF: Origin igual al sitio del Host y
 * JSON (los navegadores no envían JSON entre orígenes sin preflight).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly registry: AuthRegistry,
    private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [ctx.getHandler(), ctx.getClass()]))
      return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (MUTATING.has(req.method) && !req.headers.authorization) this.checkOrigin(req);
    const res = await this.registry.session(req);
    if (!res) throw new UnauthorizedException({ code: "unauthenticated", message: "Sesión no válida" });
    if (!res.user.emailVerified) {
      throw new ForbiddenException({ code: "email_not_verified", message: "Correo sin verificar" });
    }
    req.user = res.user;
    req.sessionId = res.sessionId;
    return true;
  }

  private checkOrigin(req: FastifyRequest): void {
    const expected = this.env.site.siteUrl[requestLang(req, this.env)];
    const origin = req.headers.origin;
    const type = req.headers["content-type"] ?? "";
    if (origin !== new URL(expected).origin && !this.env.TEST_MODE) {
      throw new ForbiddenException({ code: "bad_origin", message: "Origen no permitido" });
    }
    if (req.body !== undefined && !String(type).includes("application/json")) {
      throw new ForbiddenException({ code: "json_required", message: "Se requiere JSON" });
    }
  }
}

/** Usuario de la sesión (lo deja SessionGuard). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionUser => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw new UnauthorizedException();
  return user;
});
