import type { Lang } from "@mcet/i18n";
import { Inject, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { requestLang, toHeaders } from "../common/request.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { type Database, DB } from "../db/db.module.js";
import { MailService } from "../mail/mail.service.js";
import { AltchaService } from "../security/altcha.service.js";
import { type Auth, createAuth } from "./auth.factory.js";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  locale: Lang;
  timezone: string;
  /** Canal de la petición; por defecto, el panel. Las herramientas MCP usan "mcp". */
  via?: "panel" | "mcp";
  /** Tableros a los que se limita la petición (aplicación de IA con tableros elegidos). */
  calendarIds?: readonly string[];
}

/** Una instancia de Better Auth por dominio; se elige por el Host de la petición. */
@Injectable()
export class AuthRegistry {
  private readonly instances: Record<Lang, Auth>;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DB) db: Database,
    mail: MailService,
    altcha: AltchaService,
  ) {
    const deps = { env, db, mail, verifyAltcha: (h: string | undefined) => altcha.verify(h) };
    this.instances = { es: createAuth("es", deps), en: createAuth("en", deps) };
  }

  forLang(lang: Lang): Auth {
    return this.instances[lang];
  }

  forRequest(req: Pick<FastifyRequest, "headers">): Auth {
    return this.instances[requestLang(req, this.env)];
  }

  /** Sesión de la petición (cookie del dominio o Bearer del embed). */
  async session(
    req: Pick<FastifyRequest, "headers">,
  ): Promise<{ user: SessionUser; sessionId: string } | null> {
    const res = await this.forRequest(req).api.getSession({ headers: toHeaders(req.headers) });
    if (!res) return null;
    const u = res.user as typeof res.user & { locale?: string; timezone?: string };
    return {
      sessionId: res.session.id,
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        emailVerified: u.emailVerified,
        locale: u.locale === "en" ? "en" : "es",
        timezone: u.timezone ?? "UTC",
      },
    };
  }
}
