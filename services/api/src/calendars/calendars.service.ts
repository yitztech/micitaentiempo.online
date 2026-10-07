import type { Calendar } from "@mcet/contracts/mcet/calendar/v1/calendar_pb";
import { CalendarService } from "@mcet/contracts/mcet/calendar/v1/calendar_pb";
import type { CreateCalendar, UpdateCalendar } from "@mcet/schemas";
import { ConflictException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import type { SessionUser } from "../auth/auth.registry.js";
import { type Database, DB } from "../db/db.module.js";
import { calendarMembers } from "../db/schema.js";
import { asActor, type CalendarClients } from "../internal-rpc/calendar-client.js";
import { CALENDAR } from "../internal-rpc/internal-rpc.module.js";
import { OrgsService } from "../orgs/orgs.service.js";
import { CalendarAccess } from "./access.service.js";
import { rpc } from "./rpc-errors.js";

export function calendarView(c: Calendar, role?: string) {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    timezone: c.timezone,
    capacity: c.capacity,
    country: c.country || null,
    subdivision: c.subdivision || null,
    address: c.address || null,
    embedPolicy: { mode: c.embedPolicy?.mode ?? "any", origins: c.embedPolicy?.origins ?? [] },
    cancelMinNoticeMinutes: c.bookingPolicy?.cancelMinNoticeMinutes ?? 0,
    status: c.status,
    orgStatus: c.orgStatus,
    ...(role ? { role } : {}),
  };
}

@Injectable()
export class CalendarsService {
  constructor(
    @Inject(CALENDAR) private readonly calendar: CalendarClients,
    @Inject(DB) private readonly db: Database,
    private readonly orgs: OrgsService,
    private readonly access: CalendarAccess,
    private readonly audit: AuditService,
  ) {}

  private get client() {
    return this.calendar.client(CalendarService);
  }

  /** Alta de tablero: solo el propietario, respetando el límite del plan (RF-04). */
  async create(user: SessionUser, input: CreateCalendar) {
    const org = await this.orgs.requireByOwner(user.id);
    if (org.status === "read_only" || org.status === "suspended") {
      throw new ForbiddenException({ code: "org_read_only", message: "Organización en solo lectura" });
    }
    const actor = {
      sub: user.id,
      org: org.id,
      role: "owner" as const,
      via: "panel" as const,
      loc: user.locale,
      tz: user.timezone,
    };
    const existing = await rpc(this.client.listCalendars({ orgId: org.id }, asActor({ actor })));
    const limit = this.orgs.limits(org).calendars;
    if (existing.calendars.length >= limit) {
      throw new ConflictException({ code: "plan_limit", message: `Tu plan permite ${limit} tablero(s)` });
    }
    const created = await rpc(
      this.client.createCalendar(
        {
          orgId: org.id,
          orgStatus: org.status,
          name: input.name,
          slug: input.slug ?? "",
          timezone: input.timezone,
          capacity: input.capacity,
          country: input.country ?? "",
          subdivision: input.subdivision ?? "",
          address: input.address ?? "",
        },
        asActor({ actor }),
      ),
    );
    await this.db.insert(calendarMembers).values({
      calendarId: created.id,
      orgId: org.id,
      userId: user.id,
      role: "owner",
      notify: true,
      addedBy: user.id,
    });
    await this.audit.record({
      orgId: org.id,
      actorUserId: user.id,
      via: "panel",
      action: "calendar.created",
      target: created.id,
    });
    return calendarView(created, "owner");
  }

  /** Tableros a los que el usuario tiene acceso (como propietario, editor u observador). */
  async list(user: SessionUser) {
    const ms = await this.access.memberships(user.id, user.calendarIds);
    const out = [];
    for (const m of ms) {
      const c = await rpc(
        this.client.getCalendar({ id: m.calendarId }, asActor({ actor: this.access.actor(user, m) })),
      );
      out.push(calendarView(c, m.role));
    }
    return out;
  }

  async get(user: SessionUser, id: string) {
    const m = await this.access.require(user, id, "events.read_all");
    const c = await rpc(this.client.getCalendar({ id }, asActor({ actor: this.access.actor(user, m) })));
    return calendarView(c, m.role);
  }

  async update(user: SessionUser, id: string, input: UpdateCalendar) {
    const m = await this.access.require(user, id, "settings.write");
    const c = await rpc(
      this.client.updateCalendar(
        {
          id,
          name: input.name,
          slug: input.slug,
          timezone: input.timezone,
          capacity: input.capacity,
          country: input.country,
          subdivision: input.subdivision,
          address: input.address,
          embedPolicy: input.embedPolicy,
          bookingPolicy:
            input.cancelMinNoticeMinutes === undefined
              ? undefined
              : { cancelMinNoticeMinutes: input.cancelMinNoticeMinutes },
        },
        asActor({ actor: this.access.actor(user, m) }),
      ),
    );
    return calendarView(c, m.role);
  }

  async archive(user: SessionUser, id: string, archived: boolean) {
    const m = await this.access.require(user, id, "settings.write");
    if (!archived) {
      // Reactivar cuenta para el límite del plan, igual que crear.
      const org = await this.orgs.requireByOwner(user.id);
      const active = await rpc(
        this.client.listCalendars({ orgId: org.id }, asActor({ actor: this.access.actor(user, m) })),
      );
      if (active.calendars.length >= this.orgs.limits(org).calendars) {
        throw new ConflictException({
          code: "plan_limit",
          message: "Tu plan no permite más tableros activos",
        });
      }
    }
    const c = await rpc(
      this.client.archiveCalendar({ id, archived }, asActor({ actor: this.access.actor(user, m) })),
    );
    await this.audit.record({
      orgId: m.orgId,
      actorUserId: user.id,
      via: "panel",
      action: archived ? "calendar.archived" : "calendar.restored",
      target: id,
    });
    return calendarView(c, m.role);
  }
}
