import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { AvailabilityService } from "@mcet/contracts/mcet/calendar/v1/availability_pb";
import { type Calendar, CalendarService } from "@mcet/contracts/mcet/calendar/v1/calendar_pb";
import { EventService } from "@mcet/contracts/mcet/calendar/v1/events_pb";
import { ServiceCatalogService } from "@mcet/contracts/mcet/calendar/v1/services_pb";
import { SyncService } from "@mcet/contracts/mcet/calendar/v1/sync_pb";
import type { Lang } from "@mcet/i18n";
import {
  AvailabilityQuery,
  CancelBooking,
  ConfirmHold,
  IdempotencyKey,
  MyBookingsQuery,
  OtpSend,
  OtpVerify,
  PublicHold,
  ReleaseHold,
  Reschedule,
} from "@mcet/schemas";
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { APIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import { checkOrigin, Public } from "../auth/auth.guard.js";
import { AuthRegistry, type SessionUser } from "../auth/auth.registry.js";
import { rpc } from "../calendars/rpc-errors.js";
import { requestLang, toHeaders } from "../common/request.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { type Database, DB } from "../db/db.module.js";
import { user as users } from "../db/schema.js";
import { bookingView, iso } from "../events/event.view.js";
import { sendIcs } from "../events/events.controller.js";
import { asActor, type CalendarClients } from "../internal-rpc/calendar-client.js";
import { CALENDAR } from "../internal-rpc/internal-rpc.module.js";
import type { ActorClaims } from "../internal-rpc/jwt.js";
import { AltchaService } from "../security/altcha.service.js";
import { checkEmail } from "../security/email-validation.js";
import { holderId, holdToken } from "./hold-token.js";

const SLUG = /^[a-z0-9](-?[a-z0-9]){2,59}$/;
const at = (s: string) => timestampFromDate(new Date(s));

/** Nombre del servicio en el idioma del dominio (o el primero que haya). */
const pick = (m: Record<string, string>, lang: Lang) => m[lang] || Object.values(m)[0] || "";

/**
 * API pública de reservas (embed y página pública). Las respuestas nunca incluyen datos de otros
 * clientes finales; el motor vuelve a aplicar la visibilidad del actor `customer`.
 */
@Public()
@Controller("public/v1")
export class PublicBookingController {
  constructor(
    private readonly registry: AuthRegistry,
    private readonly altcha: AltchaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(CALENDAR) private readonly rpcClients: CalendarClients,
    @Inject(DB) private readonly db: Database,
  ) {}

  private actor(req: FastifyRequest, extra: Partial<ActorClaims> = {}) {
    return asActor({ actor: { role: "customer", via: "public", loc: requestLang(req, this.env), ...extra } });
  }

  /** Cliente final con sesión (Bearer del embed o cookie del dominio); las mutaciones con cookie, sin CSRF. */
  private async customer(req: FastifyRequest): Promise<SessionUser> {
    if (req.method !== "GET" && !req.headers.authorization) checkOrigin(req, this.env);
    const s = await this.registry.session(req);
    if (!s)
      throw new UnauthorizedException({ code: "unauthenticated", message: "Inicia sesión con tu correo" });
    if (!s.user.emailVerified)
      throw new ForbiddenException({ code: "email_not_verified", message: "Correo sin verificar" });
    return s.user;
  }

  private customerActor(req: FastifyRequest, u: SessionUser) {
    return this.actor(req, { sub: u.id, tz: u.timezone });
  }

  private async calendar(req: FastifyRequest, slug: string): Promise<Calendar> {
    const missing = new NotFoundException({ code: "calendar_not_found", message: "Tablero no encontrado" });
    if (!SLUG.test(slug)) throw missing;
    const c = await rpc(
      this.rpcClients.client(CalendarService).getCalendarBySlug({ slug }, this.actor(req)),
    ).catch(() => {
      throw missing;
    });
    if (c.status !== "active" || c.orgStatus === "suspended") throw missing;
    return c;
  }

  @Get("calendars/:slug")
  async profile(@Req() req: FastifyRequest, @Param("slug") slug: string) {
    const c = await this.calendar(req, slug);
    const lang = requestLang(req, this.env);
    const services = await rpc(
      this.rpcClients.client(ServiceCatalogService).listServices({ calendarId: c.id }, this.actor(req)),
    );
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      timezone: c.timezone,
      address: c.address || null,
      bookable: c.orgStatus !== "read_only",
      embedPolicy: { mode: c.embedPolicy?.mode || "any", origins: c.embedPolicy?.origins ?? [] },
      cancelMinNoticeMinutes: c.bookingPolicy?.cancelMinNoticeMinutes ?? 0,
      services: services.services.map((s) => ({
        id: s.id,
        name: pick(s.name, lang),
        description: pick(s.description, lang) || null,
        durationMin: s.durationMin,
        color: s.color || null,
      })),
    };
  }

  @Get("calendars/:slug/availability")
  async availability(
    @Req() req: FastifyRequest,
    @Param("slug") slug: string,
    @Query(new ZodPipe(AvailabilityQuery)) q: AvailabilityQuery,
  ) {
    const c = await this.calendar(req, slug);
    const res = await rpc(
      this.rpcClients
        .client(AvailabilityService)
        .getSlots(
          { calendarId: c.id, serviceId: q.service, from: at(q.from), to: at(q.to) },
          this.actor(req),
        ),
    );
    return {
      timezone: res.timezone,
      slots: res.slots.map((s) => ({ start: iso(s.start), end: iso(s.end) })),
    };
  }

  /** Aparta un horario por 10 minutos (ALTCHA + Idempotency-Key). Devuelve el token del titular. */
  @Post("calendars/:slug/holds")
  async hold(
    @Req() req: FastifyRequest,
    @Param("slug") slug: string,
    @Body(new ZodPipe(PublicHold)) body: PublicHold,
  ) {
    const key = IdempotencyKey.safeParse(req.headers["idempotency-key"]);
    if (!key.success)
      throw new BadRequestException({ code: "idempotency_key_required", message: "Falta Idempotency-Key" });
    if (!(await this.altcha.verify(req.headers["x-altcha"] as string | undefined))) {
      throw new ForbiddenException({ code: "altcha_required", message: "Verificación antibots fallida" });
    }
    const email = await checkEmail(body.attendee.email, { skipDns: Boolean(this.env.TEST_MODE) });
    if (!email.ok) throw new BadRequestException({ code: email.problem, message: "Correo no válido" });
    const c = await this.calendar(req, slug);
    if (c.orgStatus === "read_only")
      throw new HttpException({ code: "calendar_unavailable", message: "Reservas pausadas" }, 409);
    const lang = requestLang(req, this.env);
    const token = holdToken(this.env.APP_ENC_KEY, c.id, key.data);
    const ev = await rpc(
      this.rpcClients.client(EventService).holdSlot(
        {
          calendarId: c.id,
          serviceId: body.serviceId,
          start: at(body.start),
          attendee: { ...body.attendee, email: email.normalized, locale: lang },
          customerNotes: body.notes ?? "",
          idempotencyKey: key.data,
        },
        this.actor(req, {
          sub: holderId(this.env.APP_ENC_KEY, token),
          via: body.channel,
          tz: body.attendee.timezone,
        }),
      ),
    );
    return { hold: bookingView(ev), holdToken: token };
  }

  @Post("holds/:id/release")
  @HttpCode(204)
  async release(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body(new ZodPipe(ReleaseHold)) body: z.infer<typeof ReleaseHold>,
  ) {
    await rpc(
      this.rpcClients
        .client(EventService)
        .releaseHold({ id, holderId: holderId(this.env.APP_ENC_KEY, body.holdToken) }, this.actor(req)),
    );
  }

  /** Confirma el hold con el cliente final ya verificado por código. */
  @Post("holds/:id/confirm")
  async confirm(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body(new ZodPipe(ConfirmHold)) body: ConfirmHold,
  ) {
    const u = await this.customer(req);
    const lang = requestLang(req, this.env);
    const ev = await rpc(
      this.rpcClients.client(EventService).confirmHold(
        {
          id,
          holderId: holderId(this.env.APP_ENC_KEY, body.holdToken),
          attendee: {
            name: body.name ?? u.name,
            email: u.email,
            phone: body.phone ?? "",
            locale: lang,
            timezone: body.timezone ?? u.timezone,
          },
          customerNotes: body.notes ?? "",
        },
        this.customerActor(req, u),
      ),
    );
    return bookingView(ev);
  }

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

  /** Envía el código de un solo uso al correo (ALTCHA y validación de correo en los hooks de Better Auth). */
  @Post("otp/send")
  @HttpCode(204)
  async otpSend(@Req() req: FastifyRequest, @Body(new ZodPipe(OtpSend)) body: OtpSend) {
    await this.registry
      .forRequest(req)
      .api.sendVerificationOTP({
        body: { email: body.email, type: "sign-in" },
        headers: toHeaders(req.headers),
      })
      .catch((e: unknown) => this.authError(e));
  }

  /** Verifica el código: crea la cuenta del cliente final si no existe y devuelve un token Bearer. */
  @Post("otp/verify")
  async otpVerify(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body(new ZodPipe(OtpVerify)) body: OtpVerify,
  ) {
    const res = await this.registry
      .forRequest(req)
      .api.signInEmailOTP({
        body: { email: body.email, otp: body.code },
        headers: toHeaders(req.headers),
        returnHeaders: true,
      })
      .catch((e: unknown) => this.authError(e));
    const cookies = res.headers.getSetCookie();
    if (cookies.length) void reply.header("set-cookie", cookies);
    const u = res.response.user;
    if (body.name && !u.name) {
      await this.db
        .update(users)
        .set({ name: body.name })
        .where(and(eq(users.id, u.id), eq(users.name, "")));
    }
    return {
      token: res.headers.get("set-auth-token"),
      user: { id: u.id, email: u.email, name: u.name || body.name || "" },
    };
  }

  @Get("my/bookings")
  async myBookings(
    @Req() req: FastifyRequest,
    @Query(new ZodPipe(MyBookingsQuery)) q: z.infer<typeof MyBookingsQuery>,
  ) {
    const u = await this.customer(req);
    const lang = requestLang(req, this.env);
    const opts = this.customerActor(req, u);
    const res = await rpc(
      this.rpcClients.client(EventService).listCustomerBookings({ includePast: q.includePast }, opts),
    );
    // Datos del tablero y del servicio de cada cita (pocos tableros por cliente: se piden una vez).
    const calendars = new Map<string, Promise<{ c?: Calendar; services: Map<string, string> }>>();
    const info = (id: string) => {
      let p = calendars.get(id);
      if (!p) {
        p = (async () => {
          const c = await this.rpcClients
            .client(CalendarService)
            .getCalendar({ id }, opts)
            .catch(() => undefined);
          const svcs = await this.rpcClients
            .client(ServiceCatalogService)
            .listServices({ calendarId: id }, opts)
            .catch(() => ({ services: [] }));
          return { c, services: new Map(svcs.services.map((s) => [s.id, pick(s.name, lang)])) };
        })();
        calendars.set(id, p);
      }
      return p;
    };
    return Promise.all(
      res.events.map(async (e) => {
        const { c, services } = await info(e.calendarId);
        return {
          ...bookingView(e),
          calendar: c
            ? { name: c.name, slug: c.slug, timezone: c.timezone, address: c.address || null }
            : null,
          service: e.serviceId ? (services.get(e.serviceId) ?? null) : null,
          cancelMinNoticeMinutes: c?.bookingPolicy?.cancelMinNoticeMinutes ?? 0,
        };
      }),
    );
  }

  @Post("my/bookings/:id/cancel")
  async cancel(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body(new ZodPipe(CancelBooking)) body: z.infer<typeof CancelBooking>,
  ) {
    const u = await this.customer(req);
    const res = await rpc(
      this.rpcClients
        .client(EventService)
        .cancelEvent({ id, scope: "this", reason: body.reason }, this.customerActor(req, u)),
    );
    return res.cancelled.map(bookingView)[0] ?? null;
  }

  @Patch("my/bookings/:id")
  async reschedule(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body(new ZodPipe(Reschedule)) body: Reschedule,
  ) {
    const u = await this.customer(req);
    const ev = await rpc(
      this.rpcClients
        .client(EventService)
        .rescheduleBooking(
          { id, start: at(body.start), expectedVersion: body.expectedVersion },
          this.customerActor(req, u),
        ),
    );
    return bookingView(ev);
  }

  /** Feed personal del cliente final: solo sus citas en ese negocio (webcal://). */
  @Post("my/feeds")
  async myFeed(@Req() req: FastifyRequest, @Body() body: { slug?: string }) {
    const u = await this.customer(req);
    const c = await this.calendar(req, String(body?.slug ?? ""));
    const res = await rpc(
      this.rpcClients
        .client(SyncService)
        .createFeed(
          { scope: "personal", orgId: c.orgId, locale: requestLang(req, this.env) },
          this.customerActor(req, u),
        ),
    );
    const https = `${this.env.site.siteUrl[requestLang(req, this.env)]}/ics/${res.token}.ics`;
    return { url: https, webcal: https.replace(/^https?:/, "webcal:") };
  }

  @Get("my/bookings/:id/ics")
  async ics(@Req() req: FastifyRequest, @Res() reply: FastifyReply, @Param("id") id: string) {
    const u = await this.customer(req);
    const res = await rpc(
      this.rpcClients
        .client(EventService)
        .renderICS({ id, method: "REQUEST", locale: requestLang(req, this.env) }, this.customerActor(req, u)),
    );
    return sendIcs(reply, res.ics, res.filename);
  }
}
