import type { DomainEvent } from "@mcet/contracts/mcet/api/v1/event_ingress_pb";
import { CalendarService } from "@mcet/contracts/mcet/calendar/v1/calendar_pb";
import { ServiceCatalogService } from "@mcet/contracts/mcet/calendar/v1/services_pb";
import type { Lang } from "@mcet/i18n";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import { uuidv7 } from "../auth/ids.js";
import { AppClock } from "../common/clock.js";
import { seal } from "../common/crypto.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { type Database, DB } from "../db/db.module.js";
import {
  calendarMembers,
  notificationChannels,
  notificationDeliveries,
  notificationMutes,
  notificationPreferences,
  notifications,
  reminders,
  user as users,
} from "../db/schema.js";
import { asActor, type CalendarClients } from "../internal-rpc/calendar-client.js";
import { CALENDAR } from "../internal-rpc/internal-rpc.module.js";
import { RealtimeBus } from "../internal-rpc/realtime.bus.js";
import { CHANNELS, type Channel, CUSTOMER_ESSENTIAL, type Group, groupOf } from "./groups.js";
import type { NoticeParams } from "./render.js";

const SYSTEM = asActor({ actor: { role: "system", via: "system" } });
/** Recordatorios por defecto: 24 h y 1 h antes. */
export const REMINDER_OFFSETS = [24 * 60, 60];

/** Destinatario resuelto con su idioma y zona. */
export interface Recipient {
  userId: string | null;
  email: string | null;
  name: string | null;
  lang: Lang;
  timezone: string;
}

/** Datos de una entrega en la cola. */
export interface DeliveryPayload {
  audience: "staff" | "customer";
  recipient: Recipient;
  params: NoticeParams;
  essential: boolean;
  group: Group;
  eventId?: string;
}

/**
 * Difusión de avisos (05-negocio-api.md §5.6): de cada evento de dominio salen avisos al personal del
 * tablero (nunca al autor) y al cliente final afectado, según preferencias y canales vinculados.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly serviceNames = new Map<
    string,
    { at: number; names: Map<string, Record<string, string>> }
  >();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CALENDAR) private readonly rpc: CalendarClients,
    private readonly bus: RealtimeBus,
    private readonly clock: AppClock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.bus.handle((event) => this.onEvent(event));
  }

  private get encKey(): string {
    return this.env.APP_ENC_KEY;
  }

  private async serviceName(calendarId: string, serviceId: string, lang: Lang): Promise<string | null> {
    if (!serviceId) return null;
    let hit = this.serviceNames.get(calendarId);
    if (!hit || Date.now() - hit.at > 60_000) {
      const res = await this.rpc
        .client(ServiceCatalogService)
        .listServices({ calendarId, includeInactive: true }, SYSTEM)
        .catch(() => ({ services: [] }));
      hit = { at: Date.now(), names: new Map(res.services.map((s) => [s.id, s.name])) };
      this.serviceNames.set(calendarId, hit);
    }
    const n = hit.names.get(serviceId);
    return n ? (n[lang] ?? Object.values(n)[0] ?? null) : null;
  }

  /** Tipo de aviso: los bloqueos tienen sus propios textos. */
  private noticeType(event: DomainEvent, subject: Record<string, unknown>): string {
    if (subject.kind === "block" && event.type.startsWith("event."))
      return event.type.replace("event.", "block.");
    return event.type;
  }

  async onEvent(event: DomainEvent): Promise<void> {
    const group = groupOf(event.type);
    if (!group || !event.calendarId) return;
    const subject = (event.subject ?? {}) as Record<string, unknown>;
    const str = (k: string) => (typeof subject[k] === "string" ? (subject[k] as string) : "");
    await this.syncReminders(event, subject);

    const cal = await this.rpc
      .client(CalendarService)
      .getCalendar({ id: event.calendarId }, SYSTEM)
      .catch(() => undefined);
    const base: NoticeParams = {
      type: this.noticeType(event, subject),
      calendarId: event.calendarId,
      calendar: cal?.name ?? str("calendar_name"),
      slug: cal?.slug,
      address: cal?.address || null,
      customer: str("attendee_name") || null,
      title: str("title") || null,
      start: str("start") || undefined,
      end: str("end") || undefined,
      timezone: cal?.timezone || str("calendar_timezone") || "UTC",
    };
    const actorId = event.actor?.userId ?? "";

    // Personal: propietario siempre; editores y observadores si tienen avisos activos. Nunca el autor.
    const members = await this.db
      .select({
        userId: calendarMembers.userId,
        role: calendarMembers.role,
        notify: calendarMembers.notify,
        email: users.email,
        name: users.name,
        locale: users.locale,
        timezone: users.timezone,
      })
      .from(calendarMembers)
      .innerJoin(users, eq(users.id, calendarMembers.userId))
      .where(eq(calendarMembers.calendarId, event.calendarId));
    const muted = new Set(
      (
        await this.db
          .select({ userId: notificationMutes.userId })
          .from(notificationMutes)
          .where(eq(notificationMutes.calendarId, event.calendarId))
      ).map((m) => m.userId),
    );
    const staff = members.filter(
      (m) => (m.role === "owner" || m.notify) && m.userId !== actorId && !muted.has(m.userId),
    );

    for (const m of staff) {
      const lang: Lang = m.locale === "en" ? "en" : "es";
      const params = { ...base, service: await this.serviceName(event.calendarId, str("service_id"), lang) };
      await this.db
        .insert(notifications)
        .values({
          id: `${event.eventId}:${m.userId}`,
          userId: m.userId,
          orgId: event.orgId || null,
          calendarId: event.calendarId,
          type: params.type,
          params: params as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing({ target: notifications.id });
      this.bus.publish({ type: "notification", calendarId: event.calendarId, userId: m.userId });
      const recipient: Recipient = {
        userId: m.userId,
        email: m.email,
        name: m.name,
        lang,
        timezone: m.timezone || base.timezone || "UTC",
      };
      await this.enqueueForUser(event.eventId, event.orgId, group, {
        audience: "staff",
        recipient,
        params,
        essential: false,
        group,
      });
    }

    // Cliente final afectado (solo reservaciones): correo transaccional y, si lo vinculó, WhatsApp.
    if (event.type.startsWith("booking.")) {
      const customerId = str("customer_user_id");
      const [u] = customerId ? await this.db.select().from(users).where(eq(users.id, customerId)) : [];
      const email = u?.email ?? (str("attendee_email") || null);
      if (email) {
        const lang: Lang = (u?.locale ?? str("attendee_locale")) === "en" ? "en" : "es";
        const recipient: Recipient = {
          userId: u?.id ?? null,
          email,
          name: u?.name ?? (str("attendee_name") || null),
          lang,
          timezone: str("attendee_timezone") || u?.timezone || base.timezone || "UTC",
        };
        const params = {
          ...base,
          service: await this.serviceName(event.calendarId, str("service_id"), lang),
        };
        await this.enqueueForUser(event.eventId, event.orgId, group, {
          audience: "customer",
          recipient,
          params,
          essential: CUSTOMER_ESSENTIAL.has(event.type),
          group,
          eventId: str("event_id"),
        });
      }
    }
  }

  /** Canales activos para un usuario y grupo según preferencias y vinculaciones. */
  async channelsFor(userId: string | null, group: Group, essential: boolean): Promise<Channel[]> {
    if (!userId) return ["email"];
    const prefs = await this.db
      .select()
      .from(notificationPreferences)
      .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.group, group)));
    const linked = await this.db
      .select({ channel: notificationChannels.channel })
      .from(notificationChannels)
      .where(and(eq(notificationChannels.userId, userId), eq(notificationChannels.status, "active")));
    const active = new Set<string>(["email", ...linked.map((l) => l.channel)]);
    return CHANNELS.filter((c) => {
      if (!active.has(c)) return false;
      if (c === "email" && essential) return true;
      const p = prefs.find((x) => x.channel === c);
      // Sin preferencia guardada: activo (el correo por defecto; los demás en cuanto se vinculan).
      return p ? p.enabled : true;
    });
  }

  private async enqueueForUser(
    eventId: string,
    orgId: string,
    group: Group,
    payload: DeliveryPayload,
  ): Promise<void> {
    const channels = await this.channelsFor(payload.recipient.userId, group, payload.essential);
    const who = payload.recipient.userId ?? payload.recipient.email ?? "anon";
    for (const channel of channels) {
      await this.enqueue(
        `${eventId}:${who}:${channel}`,
        orgId || null,
        channel,
        payload.audience === "staff" ? "staff" : "customer",
        payload,
      );
    }
  }

  /** Inserta una entrega (idempotente por clave). */
  async enqueue(
    dedupeKey: string,
    orgId: string | null,
    channel: Channel,
    template: string,
    payload: DeliveryPayload,
  ): Promise<void> {
    await this.db
      .insert(notificationDeliveries)
      .values({
        id: uuidv7(),
        dedupeKey,
        userId: payload.recipient.userId,
        orgId,
        channel,
        template,
        payload: payload as unknown as Record<string, unknown>,
        nextAttemptAt: this.clock.now(),
      })
      .onConflictDoNothing({ target: notificationDeliveries.dedupeKey });
  }

  /** Aviso del sistema solo en el panel (p. ej., un canal que dejó de funcionar). */
  async systemNotice(userId: string, params: NoticeParams): Promise<void> {
    await this.db.insert(notifications).values({
      id: uuidv7(),
      userId,
      type: params.type,
      params: params as unknown as Record<string, unknown>,
    });
    this.bus.publish({ type: "notification", calendarId: "", userId });
  }

  /** Programa, mueve o cancela los recordatorios de una reservación. */
  private async syncReminders(event: DomainEvent, subject: Record<string, unknown>): Promise<void> {
    const id = typeof subject.event_id === "string" ? subject.event_id : "";
    if (!id || subject.kind !== "appointment" || !event.calendarId) return;
    if (event.type === "booking.cancelled" || event.type === "event.cancelled") {
      await this.db
        .update(reminders)
        .set({ cancelledAt: this.clock.now() })
        .where(and(eq(reminders.eventId, id), isNull(reminders.sentAt)));
      return;
    }
    if (!["booking.created", "booking.rescheduled"].includes(event.type) || typeof subject.start !== "string")
      return;
    const start = new Date(subject.start);
    const now = this.clock.now();
    for (const offset of REMINDER_OFFSETS) {
      const due = new Date(start.getTime() - offset * 60_000);
      if (due <= now) continue;
      await this.db
        .insert(reminders)
        .values({
          eventId: id,
          offsetMin: offset,
          calendarId: event.calendarId,
          orgId: event.orgId,
          startAt: start,
          dueAt: due,
        })
        .onConflictDoUpdate({
          target: [reminders.eventId, reminders.offsetMin],
          set: { startAt: start, dueAt: due, sentAt: null, cancelledAt: null },
        });
    }
  }

  /** Encola el recordatorio de una cita para su cliente final (correo y, si lo vinculó, WhatsApp). */
  async enqueueReminder(
    rem: { eventId: string; offsetMin: number; calendarId: string; orgId: string },
    ev: {
      start?: { seconds: bigint; nanos: number };
      end?: { seconds: bigint; nanos: number };
      serviceId: string;
    },
    recipient: Recipient,
  ): Promise<void> {
    const cal = await this.rpc
      .client(CalendarService)
      .getCalendar({ id: rem.calendarId }, SYSTEM)
      .catch(() => undefined);
    const iso = (t?: { seconds: bigint; nanos: number }) =>
      t ? new Date(Number(t.seconds) * 1000).toISOString() : undefined;
    const params: NoticeParams = {
      type: "reminder",
      calendarId: rem.calendarId,
      calendar: cal?.name,
      slug: cal?.slug,
      address: cal?.address || null,
      service: await this.serviceName(rem.calendarId, ev.serviceId, recipient.lang),
      start: iso(ev.start),
      end: iso(ev.end),
      timezone: cal?.timezone ?? "UTC",
    };
    const channels = await this.channelsFor(recipient.userId, "reminders", false);
    for (const channel of channels) {
      await this.enqueue(
        `reminder:${rem.eventId}:${rem.offsetMin}:${channel}`,
        rem.orgId,
        channel,
        "customer",
        {
          audience: "customer",
          recipient,
          params,
          essential: false,
          group: "reminders",
          eventId: rem.eventId,
        },
      );
    }
  }

  /** Activa un canal vinculado guardando sus datos cifrados. */
  async activateChannel(
    userId: string,
    channel: "telegram" | "slack" | "whatsapp",
    data: Record<string, string>,
    label: string,
  ) {
    const secret = seal(this.encKey, data);
    await this.db
      .insert(notificationChannels)
      .values({ userId, channel, status: "active", secret, label })
      .onConflictDoUpdate({
        target: [notificationChannels.userId, notificationChannels.channel],
        set: { status: "active", secret, label },
      });
  }

  /** Marca leídos los avisos del panel (todos o uno). */
  async markRead(userId: string, id?: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ readAt: this.clock.now() })
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          id ? eq(notifications.id, id) : sql`true`,
        ),
      );
  }

  async unreadCount(userId: string): Promise<number> {
    const [r] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return r?.n ?? 0;
  }

  /** Borra avisos del panel de más de 90 días. */
  async prune(): Promise<void> {
    await this.db.delete(notifications).where(sql`${notifications.createdAt} < now() - interval '90 days'`);
  }
}
