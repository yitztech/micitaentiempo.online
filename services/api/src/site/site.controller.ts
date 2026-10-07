import type { Lang } from "@mcet/i18n";
import { ContactMessage, NewsletterSignup } from "@mcet/schemas";
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Post,
  Req,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { Public } from "../auth/auth.guard.js";
import { stripeConfig } from "../billing/stripe.config.js";
import { requestLang } from "../common/request.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { MailService } from "../mail/mail.service.js";
import { contactEmail } from "../mail/templates/emails.js";
import { AltchaService } from "../security/altcha.service.js";
import { checkEmail } from "../security/email-validation.js";

/** Qué integraciones están configuradas: la interfaz oculta o desactiva lo que falta (07-frontend.md §7.11). */
export function features(env: Env) {
  return {
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    // Público por diseño: lo usa el botón «Continuar con Google» del cliente final.
    googleClientId: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? env.GOOGLE_CLIENT_ID : null,
    microsoft: Boolean(env.MS_CLIENT_ID && env.MS_CLIENT_SECRET),
    stripe: stripeConfig(env).enabled,
    slack: Boolean(env.SLACK_CLIENT_ID),
    telegram: Boolean(env.TELEGRAM_BOT_TOKEN),
    whatsapp: Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
    newsletter: {
      es: Boolean(env.LISTMONK_URL && env.LISTMONK_LIST_UUID),
      en: Boolean(env.LISTMONK_URL_EN && env.LISTMONK_LIST_UUID_EN),
    },
  };
}

/** Páginas públicas: funciones activas, contacto y newsletter. */
@Public()
@Controller("public/v1")
export class SiteController {
  private readonly logger = new Logger(SiteController.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly mail: MailService,
    private readonly altcha: AltchaService,
  ) {}

  @Get("features")
  features() {
    return features(this.env);
  }

  private async guard(req: FastifyRequest, email: string): Promise<string> {
    if (!(await this.altcha.verify(req.headers["x-altcha"] as string | undefined))) {
      throw new ForbiddenException({ code: "altcha_required", message: "Verificación antibots fallida" });
    }
    const check = await checkEmail(email, { skipDns: Boolean(this.env.TEST_MODE) });
    if (!check.ok) throw new BadRequestException({ code: check.problem, message: "Correo no válido" });
    return check.normalized;
  }

  @Post("contact")
  @HttpCode(204)
  async contact(@Req() req: FastifyRequest, @Body(new ZodPipe(ContactMessage)) body: ContactMessage) {
    const lang = requestLang(req, this.env);
    const email = await this.guard(req, body.email);
    await this.mail.send({
      lang,
      to: this.mail.inbox(lang),
      replyTo: email,
      ...(await contactEmail(lang, { ...body, email })),
    });
    if (body.newsletter && features(this.env).newsletter[lang]) {
      await this.subscribe(lang, email, body.name).catch((err: unknown) =>
        this.logger.warn({ err }, "no se pudo dar de alta en la newsletter"),
      );
    }
  }

  @Post("newsletter")
  @HttpCode(204)
  async newsletter(@Req() req: FastifyRequest, @Body(new ZodPipe(NewsletterSignup)) body: NewsletterSignup) {
    const lang = requestLang(req, this.env);
    if (!features(this.env).newsletter[lang]) {
      throw new NotFoundException({ code: "feature_disabled", message: "Newsletter no disponible" });
    }
    const email = await this.guard(req, body.email);
    await this.subscribe(lang, email, body.name ?? "").catch(() => {
      throw new ServiceUnavailableException({
        code: "newsletter_unavailable",
        message: "Newsletter no disponible",
      });
    });
  }

  /** Alta pública en el Listmonk del idioma (doble confirmación la gestiona Listmonk). */
  private async subscribe(lang: Lang, email: string, name: string): Promise<void> {
    const url = lang === "en" ? this.env.LISTMONK_URL_EN : this.env.LISTMONK_URL;
    const list = lang === "en" ? this.env.LISTMONK_LIST_UUID_EN : this.env.LISTMONK_LIST_UUID;
    if (!url || !list) return;
    const res = await fetch(new URL("/api/public/subscription", url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, list_uuids: [list] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Listmonk respondió ${res.status}`);
  }
}
