import { MobileForgotPassword, MobileGoogleAuth, MobileSignIn, MobileSignUp } from "@mcet/schemas";
import { Body, Controller, Get, HttpCode, HttpException, Inject, Post, Req } from "@nestjs/common";
import { APIError } from "better-auth/api";
import { eq, or } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { CurrentUser, Public } from "../auth/auth.guard.js";
import { AuthRegistry, type SessionUser } from "../auth/auth.registry.js";
import { CalendarsService } from "../calendars/calendars.service.js";
import { requestLang, toHeaders } from "../common/request.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { type Database, DB } from "../db/db.module.js";
import { session as sessions } from "../db/schema.js";
import { OrgsService } from "../orgs/orgs.service.js";
import { customerSessionFor, resolveGoogleMobileIdentity } from "../public-booking/google-customer.js";
import { features } from "../site/site.controller.js";

@Public()
@Controller("public/v1/mobile")
export class PublicMobileController {
  constructor(
    private readonly registry: AuthRegistry,
    @Inject(ENV) private readonly env: Env,
    @Inject(DB) private readonly db: Database,
  ) {}

  private authError(err: unknown): never {
    if (err instanceof APIError) {
      const body = (err.body ?? {}) as { code?: string; message?: string };
      throw new HttpException(
        { code: (body.code ?? "auth_error").toLowerCase(), message: body.message ?? err.message },
        err.statusCode,
      );
    }
    throw err;
  }

  private mobileHeaders(req: FastifyRequest): Headers {
    const lang = requestLang(req, this.env);
    return toHeaders({
      ...req.headers,
      origin: this.env.site.siteUrl[lang],
    });
  }

  /** Configuración de arranque para las apps móviles Expo (Android e iOS, teléfonos y tablets). */
  @Get("bootstrap")
  async bootstrap(@Req() req: FastifyRequest) {
    const lang = requestLang(req, this.env);
    const current = await this.registry.session(req).catch(() => null);
    return {
      lang,
      siteUrl: this.env.site.siteUrl[lang],
      features: features(this.env),
      auth: {
        schemes: ["micitaentiempo", "myappointmentontime"],
        googleRedirectPath: "/oauth/google",
      },
      user: current?.user ?? null,
    };
  }

  /** Alta de cuenta desde la app móvil (mismas reglas de nombre, correo y contraseña). */
  @Post("auth/sign-up")
  async signUp(@Req() req: FastifyRequest, @Body(new ZodPipe(MobileSignUp)) body: MobileSignUp) {
    const res = await this.registry
      .forRequest(req)
      .api.signUpEmail({
        body: { name: body.name, email: body.email, password: body.password },
        headers: this.mobileHeaders(req),
      })
      .catch((e: unknown) => this.authError(e));
    return { user: res.user };
  }

  /** Inicio de sesión con correo y contraseña desde la app móvil; devuelve token Bearer. */
  @Post("auth/sign-in")
  async signIn(@Req() req: FastifyRequest, @Body(new ZodPipe(MobileSignIn)) body: MobileSignIn) {
    const res = await this.registry
      .forRequest(req)
      .api.signInEmail({
        body: { email: body.email, password: body.password },
        headers: this.mobileHeaders(req),
        returnHeaders: true,
      })
      .catch((e: unknown) => this.authError(e));
    const raw = res.response as {
      token?: string;
      user?: { id: string; email: string; name: string };
      twoFactorRedirect?: boolean;
    };
    return {
      token: res.headers.get("set-auth-token") ?? raw.token ?? null,
      user: raw.user ?? null,
      twoFactorRedirect: Boolean(raw.twoFactorRedirect),
    };
  }

  /** Recuperación de contraseña desde la app móvil. */
  @Post("auth/forgot-password")
  async forgotPassword(
    @Req() req: FastifyRequest,
    @Body(new ZodPipe(MobileForgotPassword)) body: MobileForgotPassword,
  ) {
    const lang = requestLang(req, this.env);
    await this.registry
      .forRequest(req)
      .api.requestPasswordReset({
        body: {
          email: body.email,
          redirectTo: `${this.env.site.siteUrl[lang]}/reset-password`,
        },
        headers: this.mobileHeaders(req),
      })
      .catch((e: unknown) => this.authError(e));
    return { ok: true };
  }

  /**
   * «Continuar con Google» en la app móvil (tanto para propietarios del panel como para clientes finales):
   * acepta código OAuth PKCE (`code` + `redirectUri` + `codeVerifier`) o `idToken` nativo de Google.
   */
  @Post("auth/google")
  async google(@Req() req: FastifyRequest, @Body(new ZodPipe(MobileGoogleAuth)) body: MobileGoogleAuth) {
    const id = await resolveGoogleMobileIdentity(this.env, body);
    if (!id) {
      throw new HttpException({ code: "google_failed", message: "No se pudo verificar con Google" }, 400);
    }
    return customerSessionFor(this.registry.forRequest(req), id, requestLang(req, this.env));
  }

  /** Cierre de sesión móvil: revoca el token Bearer activo. */
  @Post("auth/sign-out")
  @HttpCode(204)
  async signOut(@Req() req: FastifyRequest) {
    const rawAuth = String(req.headers.authorization ?? "");
    const bearerToken = rawAuth.startsWith("Bearer ") ? rawAuth.slice(7).trim() : "";
    const current = await this.registry.session(req).catch(() => null);
    if (current?.sessionId && bearerToken) {
      await this.db
        .delete(sessions)
        .where(or(eq(sessions.id, current.sessionId), eq(sessions.token, bearerToken)));
    } else if (current?.sessionId) {
      await this.db.delete(sessions).where(eq(sessions.id, current.sessionId));
    } else if (bearerToken) {
      await this.db.delete(sessions).where(eq(sessions.token, bearerToken));
    }
  }
}

@Controller("v1/mobile")
export class MobilePanelController {
  constructor(
    private readonly orgs: OrgsService,
    private readonly calendars: CalendarsService,
  ) {}

  /** Resumen unificado del panel para las apps móviles (usuario, organización y tableros). */
  @Get("summary")
  async summary(@CurrentUser() user: SessionUser) {
    const org = await this.orgs.findByOwner(user.id);
    const calendars = await this.calendars.list(user);
    return {
      user,
      org: org
        ? {
            id: org.id,
            name: org.name,
            plan: org.plan,
            status: org.status,
            trialEndsAt: org.trialEndsAt?.toISOString() ?? null,
            country: org.country,
            limits: this.orgs.limits(org),
          }
        : null,
      calendars,
    };
  }
}
