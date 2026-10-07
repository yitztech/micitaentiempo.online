import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { EventService } from "@mcet/contracts/mcet/calendar/v1/events_pb";
import { StatsService } from "@mcet/contracts/mcet/calendar/v1/stats_pb";
import {
  Attendance,
  CancelEvent,
  CreateEvent,
  EventsQuery,
  IdempotencyKey,
  StatsQuery,
  UpdateEvent,
} from "@mcet/schemas";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import { CurrentUser } from "../auth/auth.guard.js";
import type { SessionUser } from "../auth/auth.registry.js";
import type { Action } from "../auth/permissions.js";
import { CalendarAccess } from "../calendars/access.service.js";
import { rpc } from "../calendars/rpc-errors.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { type Database, DB } from "../db/db.module.js";
import { customerLinks } from "../db/schema.js";
import { asActor, type CalendarClients } from "../internal-rpc/calendar-client.js";
import { CALENDAR } from "../internal-rpc/internal-rpc.module.js";
import { conflictView, eventView } from "./event.view.js";

const at = (s: string) => timestampFromDate(new Date(s));

function idempotency(raw: string | undefined): string {
  if (raw === undefined) return "";
  const parsed = IdempotencyKey.safeParse(raw);
  if (!parsed.success)
    throw new BadRequestException({ code: "invalid_idempotency_key", message: "Idempotency-Key no válida" });
  return parsed.data;
}

/** Eventos del panel: citas, bloqueos y series (docs/plan/05-negocio-api.md §5.7). */
@Controller("v1/calendars/:id/events")
export class EventsController {
  constructor(
    private readonly access: CalendarAccess,
    @Inject(CALENDAR) private readonly rpcClients: CalendarClients,
    @Inject(DB) private readonly db: Database,
  ) {}

  private async call(user: SessionUser, calendarId: string, action: Action) {
    const m = await this.access.require(user, calendarId, action);
    return {
      client: this.rpcClients.client(EventService),
      opts: asActor({ actor: this.access.actor(user, m) }),
      m,
    };
  }

  /** Carga el evento y comprueba que sea de este tablero (si no, no existe). */
  private async event(user: SessionUser, calendarId: string, eventId: string, action: Action) {
    const c = await this.call(user, calendarId, action);
    const ev = await rpc(c.client.getEvent({ id: eventId }, c.opts));
    if (ev.calendarId !== calendarId)
      throw new NotFoundException({ code: "event_not_found", message: "Evento no encontrado" });
    return { ...c, ev };
  }

  @Get()
  async list(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Query(new ZodPipe(EventsQuery)) q: EventsQuery,
  ) {
    const { client, opts } = await this.call(user, id, "events.read_all");
    const res = await rpc(
      client.listEvents(
        { calendarId: id, from: at(q.from), to: at(q.to), includeCancelled: q.includeCancelled },
        opts,
      ),
    );
    return res.events.map(eventView);
  }

  @Get(":eventId")
  async get(@CurrentUser() user: SessionUser, @Param("id") id: string, @Param("eventId") eventId: string) {
    return eventView((await this.event(user, id, eventId, "events.read_all")).ev);
  }

  @Post()
  async create(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodPipe(CreateEvent)) body: CreateEvent,
    @Headers("idempotency-key") key?: string,
  ) {
    const action: Action =
      body.kind === "block" ? "blocks.write" : body.rrule ? "events.recurring" : "events.write";
    const { client, opts, m } = await this.call(user, id, action);
    if (body.customerUserId) {
      // Solo se agenda a nombre de clientes finales de esta organización.
      const [link] = await this.db
        .select()
        .from(customerLinks)
        .where(and(eq(customerLinks.orgId, m.orgId), eq(customerLinks.userId, body.customerUserId)));
      if (!link)
        throw new BadRequestException({ code: "unknown_customer", message: "Cliente final desconocido" });
    }
    const res = await rpc(
      client.createEvent(
        {
          calendarId: id,
          kind: body.kind,
          start: at(body.start),
          end: body.end ? at(body.end) : undefined,
          serviceId: body.serviceId ?? "",
          title: body.title ?? "",
          customerUserId: body.customerUserId ?? "",
          attendee: body.attendee,
          internalNotes: body.internalNotes ?? "",
          rrule: body.rrule ?? "",
          onConflict: body.onConflict,
          idempotencyKey: idempotency(key),
          cancelOverlapping: body.cancelOverlapping,
        },
        opts,
      ),
    );
    if (!res.event) {
      throw new ConflictException({
        code: "series_conflict",
        message: "Algunas fechas de la serie no están libres",
        conflicts: res.conflicts.map(conflictView),
      });
    }
    return {
      event: eventView(res.event),
      seriesId: res.seriesId || null,
      instances: res.instances,
      conflicts: res.conflicts.map(conflictView),
      affected: res.affected.map(eventView),
    };
  }

  @Patch(":eventId")
  async update(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Param("eventId") eventId: string,
    @Body(new ZodPipe(UpdateEvent)) body: UpdateEvent,
  ) {
    const action: Action = body.rrule || body.scope !== "this" ? "events.recurring" : "events.write";
    const { client, opts } = await this.event(user, id, eventId, action);
    const res = await rpc(
      client.updateEvent(
        {
          id: eventId,
          expectedVersion: body.expectedVersion,
          scope: body.scope,
          start: body.start ? at(body.start) : undefined,
          end: body.end ? at(body.end) : undefined,
          title: body.title,
          internalNotes: body.internalNotes,
          attendee: body.attendee,
          rrule: body.rrule,
        },
        opts,
      ),
    );
    if (!res.event) {
      throw new ConflictException({
        code: "series_conflict",
        message: "Algunas fechas de la serie no están libres",
        conflicts: res.conflicts.map(conflictView),
      });
    }
    return eventView(res.event);
  }

  @Post(":eventId/cancel")
  async cancel(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Param("eventId") eventId: string,
    @Body(new ZodPipe(CancelEvent)) body: CancelEvent,
  ) {
    const { client, opts } = await this.event(
      user,
      id,
      eventId,
      body.scope === "this" ? "events.write" : "events.recurring",
    );
    const res = await rpc(client.cancelEvent({ id: eventId, ...body }, opts));
    return { cancelled: res.cancelled.map(eventView) };
  }

  /** Quitar un bloqueo (las citas se cancelan con /cancel, que avisa al cliente). */
  @Delete(":eventId")
  @HttpCode(204)
  async removeBlock(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Param("eventId") eventId: string,
  ) {
    const { client, opts, ev } = await this.event(user, id, eventId, "blocks.write");
    if (ev.kind !== "block")
      throw new ConflictException({ code: "not_a_block", message: "Solo se borran bloqueos" });
    await rpc(client.cancelEvent({ id: eventId, scope: "this", reason: "removed" }, opts));
  }

  @Post(":eventId/attendance")
  async attendance(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Param("eventId") eventId: string,
    @Body(new ZodPipe(Attendance)) body: Attendance,
  ) {
    const { client, opts } = await this.event(user, id, eventId, "events.write");
    return eventView(await rpc(client.markAttendance({ id: eventId, attendance: body.attendance }, opts)));
  }

  @Get(":eventId/ics")
  async ics(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Param("eventId") eventId: string,
    @Res() reply: FastifyReply,
  ) {
    const { client, opts } = await this.event(user, id, eventId, "events.read_all");
    const res = await rpc(client.renderICS({ id: eventId, method: "PUBLISH", locale: user.locale }, opts));
    return sendIcs(reply, res.ics, res.filename);
  }
}

export function sendIcs(reply: FastifyReply, ics: Uint8Array, filename: string) {
  return reply
    .header("Content-Type", "text/calendar; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${filename}"`)
    .header("Cache-Control", "private, no-store")
    .send(Buffer.from(ics));
}

/** Estadísticas de un tablero (propietario y editores). */
@Controller("v1/stats")
export class StatsController {
  constructor(
    private readonly access: CalendarAccess,
    @Inject(CALENDAR) private readonly rpcClients: CalendarClients,
  ) {}

  @Get()
  async stats(@CurrentUser() user: SessionUser, @Query(new ZodPipe(StatsQuery)) q: StatsQuery) {
    const m = await this.access.require(user, q.calendar, "stats.read");
    const r = await rpc(
      this.rpcClients
        .client(StatsService)
        .getStats(
          { calendarId: q.calendar, from: at(q.from), to: at(q.to) },
          asActor({ actor: this.access.actor(user, m) }),
        ),
    );
    const kv = (xs: { key: string; count: number }[]) => xs.map((x) => ({ key: x.key, count: x.count }));
    return {
      confirmed: r.confirmed,
      cancelled: r.cancelled,
      attended: r.attended,
      noShow: r.noShow,
      customers: r.customers,
      bookedMinutes: r.bookedMinutes,
      blockedMinutes: r.blockedMinutes,
      byService: kv(r.byService),
      byWeekday: kv(r.byWeekday),
      byHour: kv(r.byHour),
      byVia: kv(r.byVia),
    };
  }
}
