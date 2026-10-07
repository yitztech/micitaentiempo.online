import { timestampDate } from "@bufbuild/protobuf/wkt";
import { EventService } from "@mcet/contracts/mcet/calendar/v1/events_pb";
import { type Lang, pathFor } from "@mcet/i18n";
import { PLAN_LIMITS } from "@mcet/schemas";
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { AppClock } from "../common/clock.js";
import { open, sign } from "../common/crypto.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { type Database, DB } from "../db/db.module.js";
import {
  notificationChannels,
  notificationDeliveries,
  organizations,
  reminders,
  user as users,
} from "../db/schema.js";
import { asActor, type CalendarClients } from "../internal-rpc/calendar-client.js";
import { CALENDAR } from "../internal-rpc/internal-rpc.module.js";
import { MailService } from "../mail/mail.service.js";
import { customerNoticeEmail, staffNoticeEmail } from "../mail/templates/emails.js";
import { ChannelError, sendSlack, sendTelegram, sendWhatsApp } from "./channels/senders.js";
import type { Channel } from "./groups.js";
import { type DeliveryPayload, NotificationsService } from "./notifications.service.js";
import { customerText, NOTICES, staffText } from "./render.js";

const SYSTEM = asActor({ actor: { role: "system", via: "system" } });
const MAX_ATTEMPTS = 5;
const BATCH = 20;

type Row = typeof notificationDeliveries.$inferSelect;

/**
 * Worker de avisos dentro de `api`: entrega la cola (`notification_deliveries`) y dispara los
 * recordatorios. Usa el reloj de `api` (fijable en TEST_MODE) y FOR UPDATE SKIP LOCKED.
 */
@Injectable()
export class DeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeliveryWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(CALENDAR) private readonly rpc: CalendarClients,
    private readonly mail: MailService,
    private readonly notices: NotificationsService,
    private readonly clock: AppClock,
  ) {}

  onModuleInit(): void {
    if (process.env.VITEST) return;
    this.timer = setInterval(
      () => void this.tick().catch((err) => this.logger.error({ err }, "tick de avisos")),
      2_000,
    );
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Una pasada: recordatorios vencidos y entregas pendientes. */
  async tick(): Promise<{ reminders: number; delivered: number }> {
    if (this.running) return { reminders: 0, delivered: 0 };
    this.running = true;
    try {
      const r = await this.fireReminders();
      let delivered = 0;
      for (;;) {
        const batch = await this.claim();
        if (batch.length === 0) break;
        for (const row of batch) delivered += (await this.deliver(row)) ? 1 : 0;
      }
      return { reminders: r, delivered };
    } finally {
      this.running = false;
    }
  }

  /** Reclama entregas vencidas y las aparta 5 min (si el proceso muere, vuelven a la cola). */
  private async claim(): Promise<Row[]> {
    const now = this.clock.now();
    const res = await this.db.execute(sql`
      update app.notification_deliveries d set attempts = d.attempts + 1, next_attempt_at = ${new Date(now.getTime() + 300_000)}
      where d.id in (
        select id from app.notification_deliveries
        where status = 'pending' and next_attempt_at <= ${now}
        order by next_attempt_at limit ${BATCH} for update skip locked
      ) returning d.id`);
    const ids = (res.rows as Array<{ id: string }>).map((r) => r.id);
    if (ids.length === 0) return [];
    const rows: Row[] = [];
    for (const id of ids) {
      const [row] = await this.db
        .select()
        .from(notificationDeliveries)
        .where(eq(notificationDeliveries.id, id));
      if (row) rows.push(row);
    }
    return rows;
  }

  private async deliver(row: Row): Promise<boolean> {
    const payload = row.payload as unknown as DeliveryPayload;
    try {
      await this.send(row.channel, payload, row);
      await this.db
        .update(notificationDeliveries)
        .set({ status: "sent", sentAt: this.clock.now(), lastError: null })
        .where(eq(notificationDeliveries.id, row.id));
      return true;
    } catch (err) {
      const permanent = err instanceof ChannelError && err.permanent;
      const failed = permanent || row.attempts >= MAX_ATTEMPTS;
      const backoff = 30_000 * 2 ** (row.attempts - 1);
      await this.db
        .update(notificationDeliveries)
        .set({
          status: failed ? "failed" : "pending",
          lastError: String((err as Error).message).slice(0, 500),
          nextAttemptAt: new Date(this.clock.now().getTime() + backoff),
        })
        .where(eq(notificationDeliveries.id, row.id));
      if (failed && row.userId && row.channel !== "email") {
        if (permanent) {
          await this.db
            .update(notificationChannels)
            .set({ status: "disabled" })
            .where(
              and(eq(notificationChannels.userId, row.userId), eq(notificationChannels.channel, row.channel)),
            );
        }
        await this.notices.systemNotice(row.userId, { type: "channel.failed", channel: row.channel });
      }
      this.logger.warn(
        { id: row.id, channel: row.channel, attempts: row.attempts, failed },
        "entrega fallida",
      );
      return false;
    }
  }

  private siteUrl(lang: Lang): string {
    return this.env.site.siteUrl[lang];
  }

  private unsubscribeUrl(
    lang: Lang,
    userId: string | null,
    group: string,
    channel: string,
  ): string | undefined {
    if (!userId) return undefined;
    const data = `${userId}.${group}.${channel}`;
    return `${this.siteUrl(lang)}/api/public/v1/unsubscribe?d=${encodeURIComponent(data)}&s=${sign(this.env.APP_ENC_KEY, data)}`;
  }

  private async send(channel: Channel, p: DeliveryPayload, row: Row): Promise<void> {
    const { recipient: r, params } = p;
    const tz = r.timezone || params.timezone || "UTC";
    const panelUrl = `${this.siteUrl(r.lang)}${params.calendarId ? pathFor("calendar", r.lang, { id: params.calendarId }) : pathFor("dashboard", r.lang)}`;
    const manageUrl = `${this.siteUrl(r.lang)}${pathFor("myAppointments", r.lang)}`;
    const text =
      p.audience === "staff" ? staffText(r.lang, params, tz) : customerText(r.lang, params, tz).text;

    if (channel === "email") {
      if (!r.email) throw new ChannelError("sin correo", true);
      if (row.template === "billing") {
        const url = `${this.siteUrl(r.lang)}${pathFor("billing", r.lang)}`;
        await this.mail.send({
          lang: r.lang,
          to: r.email,
          ...(await customerNoticeEmail(r.lang, {
            subject: NOTICES[r.lang].subjects.billing,
            text,
            name: r.name,
            manageUrl: url,
            buttonLabel: NOTICES[r.lang].openPanel,
          })),
        });
        return;
      }
      if (p.audience === "staff") {
        const unsub = this.unsubscribeUrl(r.lang, r.userId, p.group, "email") ?? panelUrl;
        await this.mail.send({
          lang: r.lang,
          to: r.email,
          ...(await staffNoticeEmail(r.lang, {
            calendar: params.calendar ?? "",
            text,
            url: panelUrl,
            unsubscribeUrl: unsub,
          })),
          headers: {
            "List-Unsubscribe": `<${unsub}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        return;
      }
      const { subject } = customerText(r.lang, params, tz);
      const unsub = p.essential ? undefined : this.unsubscribeUrl(r.lang, r.userId, p.group, "email");
      const attachments = [];
      if (p.eventId && params.type !== "reminder") {
        const ics = await this.rpc
          .client(EventService)
          .renderICS(
            {
              id: p.eventId,
              method: params.type === "booking.cancelled" ? "CANCEL" : "REQUEST",
              locale: r.lang,
            },
            SYSTEM,
          )
          .catch(() => undefined);
        if (ics)
          attachments.push({
            filename: ics.filename,
            content: Buffer.from(ics.ics),
            contentType: "text/calendar; charset=utf-8",
          });
      }
      await this.mail.send({
        lang: r.lang,
        to: r.email,
        ...(await customerNoticeEmail(r.lang, {
          subject,
          text,
          name: r.name,
          address: params.address,
          reason: params.reason,
          manageUrl,
          unsubscribeUrl: unsub,
        })),
        attachments,
        ...(unsub
          ? {
              headers: {
                "List-Unsubscribe": `<${unsub}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
      });
      return;
    }

    if (!r.userId) throw new ChannelError("sin usuario", true);
    const [link] = await this.db
      .select()
      .from(notificationChannels)
      .where(
        and(
          eq(notificationChannels.userId, r.userId),
          eq(notificationChannels.channel, channel),
          eq(notificationChannels.status, "active"),
        ),
      );
    if (!link) throw new ChannelError("canal no vinculado", true);
    const secret = open<Record<string, string>>(this.env.APP_ENC_KEY, link.secret);
    const label = p.audience === "staff" ? NOTICES[r.lang].openPanel : NOTICES[r.lang].manage;
    const url = p.audience === "staff" ? panelUrl : manageUrl;

    if (channel === "telegram") {
      if (!this.env.TELEGRAM_BOT_TOKEN) throw new ChannelError("Telegram sin configurar", true);
      await sendTelegram(this.env.TELEGRAM_API_URL, this.env.TELEGRAM_BOT_TOKEN, secret.chatId ?? "", text, {
        url,
        label,
      });
      return;
    }
    if (channel === "slack") {
      await sendSlack(secret.webhookUrl ?? "", text, { url, label });
      return;
    }
    if (channel === "whatsapp") {
      if (!this.env.WHATSAPP_TOKEN || !this.env.WHATSAPP_PHONE_NUMBER_ID)
        throw new ChannelError("WhatsApp sin configurar", true);
      await this.checkWhatsAppQuota(row.orgId);
      await sendWhatsApp(
        this.env.WHATSAPP_API_URL,
        this.env.WHATSAPP_TOKEN,
        this.env.WHATSAPP_PHONE_NUMBER_ID,
        secret.phone ?? "",
        r.lang,
        "mcet_aviso",
        text,
      );
    }
  }

  /** Cupo mensual de WhatsApp por plan (PLAN_LIMITS). */
  private async checkWhatsAppQuota(orgId: string | null): Promise<void> {
    if (!orgId) return;
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, orgId));
    if (!org) return;
    const now = this.clock.now();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [r] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.orgId, orgId),
          eq(notificationDeliveries.channel, "whatsapp"),
          eq(notificationDeliveries.status, "sent"),
          gte(notificationDeliveries.sentAt, monthStart),
        ),
      );
    if ((r?.n ?? 0) >= PLAN_LIMITS[org.plan].whatsappPerMonth)
      throw new ChannelError("cupo de WhatsApp agotado", true);
  }

  /** Recordatorios vencidos: se revalidan contra el motor (sigue confirmada y a la misma hora). */
  private async fireReminders(): Promise<number> {
    const now = this.clock.now();
    const due = await this.db
      .update(reminders)
      .set({ sentAt: now })
      .where(and(isNull(reminders.sentAt), isNull(reminders.cancelledAt), lte(reminders.dueAt, now)))
      .returning();
    let n = 0;
    for (const rem of due) {
      const ev = await this.rpc
        .client(EventService)
        .getEvent({ id: rem.eventId }, SYSTEM)
        .catch(() => undefined);
      if (
        !ev ||
        ev.status !== "confirmed" ||
        !ev.start ||
        timestampDate(ev.start).getTime() !== rem.startAt.getTime()
      )
        continue;
      const [u] = ev.customerUserId
        ? await this.db.select().from(users).where(eq(users.id, ev.customerUserId))
        : [];
      const email = u?.email ?? ev.attendee?.email;
      if (!email) continue;
      const lang: Lang = (u?.locale ?? ev.attendee?.locale) === "en" ? "en" : "es";
      await this.notices.enqueueReminder(rem, ev, {
        userId: u?.id ?? null,
        email,
        name: u?.name ?? ev.attendee?.name ?? null,
        lang,
        timezone: ev.attendee?.timezone || u?.timezone || "UTC",
      });
      n++;
    }
    return n;
  }
}
