import { CalendarService } from "@mcet/contracts/mcet/calendar/v1/calendar_pb";
import { type Lang, pathFor } from "@mcet/i18n";
import { PLAN_LIMITS, type Plan, TRIAL_DAYS } from "@mcet/schemas";
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, eq, isNull, lte } from "drizzle-orm";
import type Stripe from "stripe";
import { AuditService } from "../audit/audit.service.js";
import { AppClock } from "../common/clock.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { type Database, DB } from "../db/db.module.js";
import { billingEvents, organizations, user as users } from "../db/schema.js";
import { asActor, type CalendarClients } from "../internal-rpc/calendar-client.js";
import { CALENDAR } from "../internal-rpc/internal-rpc.module.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { LOOKUP_KEYS, type PaidPlan, planOfLookupKey, stripeClient, stripeConfig } from "./stripe.config.js";

type Org = typeof organizations.$inferSelect;
export type OrgStatus = Org["status"];
const SYSTEM = asActor({ actor: { role: "system", via: "system" } });
const DAY = 86_400_000;

/** Estado de la organización según la suscripción de Stripe (máquina de estados de §5.5). */
export function statusFromSubscription(sub: Pick<Stripe.Subscription, "status">): OrgStatus {
  switch (sub.status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    default:
      return "read_only"; // canceled, incomplete_expired, paused, incomplete
  }
}

/** Fin del periodo actual (en APIs recientes vive en el elemento de la suscripción). */
function periodEnd(sub: Stripe.Subscription): Date | null {
  const item = sub.items?.data?.[0] as
    | (Stripe.SubscriptionItem & { current_period_end?: number })
    | undefined;
  const raw =
    item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  return raw ? new Date(raw * 1000) : null;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(CALENDAR) private readonly rpc: CalendarClients,
    private readonly clock: AppClock,
    private readonly notices: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  get config() {
    return stripeConfig(this.env);
  }

  private stripe(): Stripe {
    const cfg = this.config;
    if (!cfg.enabled)
      throw new NotFoundException({ code: "billing_disabled", message: "Facturación disponible pronto" });
    return stripeClient(cfg);
  }

  async orgOf(userId: string): Promise<Org> {
    const [org] = await this.db
      .select()
      .from(organizations)
      .where(and(eq(organizations.ownerUserId, userId), isNull(organizations.deletedAt)));
    if (!org) throw new NotFoundException({ code: "org_not_found", message: "Sin organización" });
    return org;
  }

  /** Vista de facturación. Sin Stripe, la prueba no vence: no se muestra fecha de fin. */
  view(org: Org) {
    const enabled = this.config.enabled;
    return {
      enabled,
      publishableKey: enabled ? this.config.publishableKey : null,
      plan: org.plan,
      status: org.status,
      trialEndsAt: enabled ? (org.trialEndsAt?.toISOString() ?? null) : null,
      currentPeriodEnd: org.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: org.cancelAtPeriodEnd,
      hasSubscription: Boolean(org.stripeSubscriptionId),
      limits: PLAN_LIMITS[org.plan],
    };
  }

  /** Cambia estado (y lo refleja en el motor) avisando al propietario si corresponde. */
  async setStatus(
    org: Org,
    status: OrgStatus,
    notice?: { type: string; days?: number },
    patch: Partial<Org> = {},
  ): Promise<Org> {
    const now = this.clock.now();
    const [updated] = await this.db
      .update(organizations)
      .set({
        ...patch,
        status,
        pastDueSince: status === "past_due" ? (org.pastDueSince ?? now) : null,
      })
      .where(eq(organizations.id, org.id))
      .returning();
    if (org.status !== status) {
      await this.rpc.client(CalendarService).setOrgStatus({ orgId: org.id, status }, SYSTEM);
      await this.audit.record({
        orgId: org.id,
        via: "system",
        action: "org.status",
        metadata: { from: org.status, to: status },
      });
    }
    if (notice) await this.notifyOwner(org, notice.type, notice.days);
    return updated ?? org;
  }

  /** Aviso de facturación al propietario: panel y correo (esencial). */
  private async notifyOwner(org: Org, type: string, days?: number): Promise<void> {
    const [owner] = await this.db.select().from(users).where(eq(users.id, org.ownerUserId));
    if (!owner) return;
    const lang: Lang = owner.locale === "en" ? "en" : "es";
    await this.notices.billingNotice(
      org.id,
      { userId: owner.id, email: owner.email, name: owner.name, lang, timezone: owner.timezone || "UTC" },
      type,
      days,
    );
  }

  /** Embedded Checkout de la suscripción, conservando los días de prueba restantes (> 48 h). */
  async checkout(userId: string, plan: PaidPlan, lang: Lang) {
    const stripe = this.stripe();
    const org = await this.orgOf(userId);
    if (org.stripeSubscriptionId && org.status !== "read_only") {
      throw new ConflictException({ code: "already_subscribed", message: "Ya tienes una suscripción" });
    }
    const [owner] = await this.db.select().from(users).where(eq(users.id, userId));
    const customer =
      org.stripeCustomerId ??
      (await stripe.customers.create({ email: owner?.email, name: org.name, metadata: { org_id: org.id } }))
        .id;
    if (!org.stripeCustomerId)
      await this.db
        .update(organizations)
        .set({ stripeCustomerId: customer })
        .where(eq(organizations.id, org.id));
    const prices = await stripe.prices.list({ lookup_keys: [LOOKUP_KEYS[plan]], active: true });
    const price = prices.data[0];
    if (!price)
      throw new ConflictException({
        code: "price_missing",
        message: "Falta el precio en Stripe (ejecuta stripe:setup)",
      });
    const now = this.clock.now();
    const trialLeft =
      org.status === "trialing" && org.trialEndsAt ? org.trialEndsAt.getTime() - now.getTime() : 0;
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      mode: "subscription",
      customer,
      line_items: [{ price: price.id, quantity: 1 }],
      locale: lang,
      metadata: { org_id: org.id },
      subscription_data: {
        metadata: { org_id: org.id },
        ...(trialLeft > 2 * DAY ? { trial_end: Math.floor((now.getTime() + trialLeft) / 1000) } : {}),
      },
      automatic_tax: { enabled: this.config.taxEnabled },
      return_url: `${this.env.site.siteUrl[lang]}${pathFor("billing", lang)}?session={CHECKOUT_SESSION_ID}`,
    });
    return { clientSecret: session.client_secret, publishableKey: this.config.publishableKey };
  }

  /** Cambio de plan con prorrateo. Bajar a Personal exige un solo tablero activo. */
  async changePlan(userId: string, plan: Plan, activeCalendars: number) {
    const org = await this.orgOf(userId);
    if (plan === org.plan) return this.view(org);
    if (activeCalendars > PLAN_LIMITS[plan].calendars) {
      throw new ConflictException({
        code: "too_many_calendars",
        message: "Archiva tableros antes de bajar de plan",
      });
    }
    if (org.stripeSubscriptionId && this.config.enabled) {
      const stripe = this.stripe();
      const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
      const item = sub.items.data[0];
      const prices = await stripe.prices.list({ lookup_keys: [LOOKUP_KEYS[plan]], active: true });
      if (!item || !prices.data[0])
        throw new ConflictException({ code: "price_missing", message: "Falta el precio en Stripe" });
      await stripe.subscriptions.update(sub.id, {
        items: [{ id: item.id, price: prices.data[0].id }],
        proration_behavior: "create_prorations",
      });
    }
    const [updated] = await this.db
      .update(organizations)
      .set({ plan })
      .where(eq(organizations.id, org.id))
      .returning();
    await this.audit.record({
      orgId: org.id,
      actorUserId: userId,
      via: "panel",
      action: "billing.plan_changed",
      metadata: { from: org.plan, to: plan },
    });
    return this.view(updated ?? org);
  }

  async setCancel(userId: string, cancel: boolean) {
    const org = await this.orgOf(userId);
    if (!org.stripeSubscriptionId)
      throw new ConflictException({ code: "no_subscription", message: "Sin suscripción" });
    await this.stripe().subscriptions.update(org.stripeSubscriptionId, { cancel_at_period_end: cancel });
    const [updated] = await this.db
      .update(organizations)
      .set({ cancelAtPeriodEnd: cancel })
      .where(eq(organizations.id, org.id))
      .returning();
    return this.view(updated ?? org);
  }

  async setupIntent(userId: string) {
    const org = await this.orgOf(userId);
    if (!org.stripeCustomerId)
      throw new ConflictException({ code: "no_customer", message: "Primero contrata un plan" });
    const si = await this.stripe().setupIntents.create({
      customer: org.stripeCustomerId,
      usage: "off_session",
    });
    return { clientSecret: si.client_secret, publishableKey: this.config.publishableKey };
  }

  async invoices(userId: string) {
    const org = await this.orgOf(userId);
    if (!org.stripeCustomerId || !this.config.enabled) return [];
    const list = await this.stripe().invoices.list({ customer: org.stripeCustomerId, limit: 24 });
    return list.data.map((i) => ({
      id: i.id,
      number: i.number,
      status: i.status,
      total: i.total,
      currency: i.currency,
      created: new Date(i.created * 1000).toISOString(),
      pdf: i.invoice_pdf ?? null,
      url: i.hosted_invoice_url ?? null,
    }));
  }

  /**
   * Webhook verificado. Idempotente por id de evento; el procesamiento vuelve a leer la suscripción de
   * Stripe, así el orden de llegada de los eventos no importa.
   */
  async handleWebhook(raw: Buffer, signature: string): Promise<{ duplicate: boolean }> {
    const cfg = this.config;
    if (!cfg.enabled)
      throw new NotFoundException({ code: "billing_disabled", message: "Facturación no activa" });
    const stripe = stripeClient(cfg);
    const event = stripe.webhooks.constructEvent(raw, signature, cfg.webhookSecret);
    const inserted = await this.db
      .insert(billingEvents)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) {
      const [prev] = await this.db.select().from(billingEvents).where(eq(billingEvents.id, event.id));
      if (prev?.processedAt) return { duplicate: true };
    }
    const subId = this.subscriptionIdOf(event);
    if (subId) {
      const sub = await stripe.subscriptions.retrieve(subId);
      await this.sync(sub, event.type === "invoice.payment_failed");
    }
    await this.db
      .update(billingEvents)
      .set({ processedAt: this.clock.now() })
      .where(eq(billingEvents.id, event.id));
    return { duplicate: false };
  }

  private subscriptionIdOf(event: Stripe.Event): string | null {
    const o = event.data.object as unknown as Record<string, unknown>;
    if (event.type === "checkout.session.completed")
      return typeof o.subscription === "string" ? o.subscription : null;
    if (event.type.startsWith("customer.subscription.")) return typeof o.id === "string" ? o.id : null;
    if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      if (typeof o.subscription === "string") return o.subscription;
      const parent = o.parent as { subscription_details?: { subscription?: string } } | undefined;
      return parent?.subscription_details?.subscription ?? null;
    }
    return null;
  }

  /** Lleva la organización al estado de su suscripción. */
  async sync(sub: Stripe.Subscription, paymentFailed = false): Promise<void> {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const orgId = sub.metadata?.org_id;
    const [org] = await this.db
      .select()
      .from(organizations)
      .where(orgId ? eq(organizations.id, orgId) : eq(organizations.stripeCustomerId, customerId));
    if (!org) {
      this.logger.warn({ sub: sub.id }, "suscripción sin organización");
      return;
    }
    const status = statusFromSubscription(sub);
    const plan = planOfLookupKey(sub.items?.data?.[0]?.price?.lookup_key) ?? org.plan;
    const patch: Partial<Org> = {
      plan,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      currentPeriodEnd: periodEnd(sub),
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      ...(status === "trialing" && sub.trial_end ? { trialEndsAt: new Date(sub.trial_end * 1000) } : {}),
    };
    let notice: { type: string } | undefined;
    if (paymentFailed || (status === "past_due" && org.status !== "past_due"))
      notice = { type: "billing.payment_failed" };
    else if (status === "active" && org.status !== "active") notice = { type: "billing.active" };
    else if (status === "read_only" && org.status !== "read_only") notice = { type: "billing.read_only" };
    await this.setStatus(org, status, notice, patch);
  }

  /**
   * Pasada periódica: fin de prueba (avisos a 7 y 3 días y paso a solo lectura) e impago de más de 7 días.
   * Sin Stripe la prueba no vence (decisión del 2026-10-06).
   */
  async sweep(): Promise<void> {
    if (!this.config.enabled) return;
    const now = this.clock.now();
    const trialing = await this.db
      .select()
      .from(organizations)
      .where(
        and(
          eq(organizations.status, "trialing"),
          isNull(organizations.deletedAt),
          isNull(organizations.stripeSubscriptionId),
        ),
      );
    for (const org of trialing) {
      if (!org.trialEndsAt) continue;
      const left = org.trialEndsAt.getTime() - now.getTime();
      if (left <= 0) {
        await this.setStatus(org, "read_only", { type: "billing.trial_ended" });
      } else if (left <= 3 * DAY && !org.trialNotice3At) {
        await this.db.update(organizations).set({ trialNotice3At: now }).where(eq(organizations.id, org.id));
        await this.notifyOwner(org, "billing.trial_ending", Math.ceil(left / DAY));
      } else if (left <= 7 * DAY && !org.trialNotice7At) {
        await this.db.update(organizations).set({ trialNotice7At: now }).where(eq(organizations.id, org.id));
        await this.notifyOwner(org, "billing.trial_ending", Math.ceil(left / DAY));
      }
    }
    const overdue = await this.db
      .select()
      .from(organizations)
      .where(
        and(
          eq(organizations.status, "past_due"),
          lte(organizations.pastDueSince, new Date(now.getTime() - 7 * DAY)),
        ),
      );
    for (const org of overdue) await this.setStatus(org, "read_only", { type: "billing.read_only" });
  }

  /**
   * `billing:activate`: al activar Stripe, las organizaciones en prueba reciben una fecha de fin
   * (por defecto, 30 días desde la activación) y un aviso.
   */
  async activate(days = TRIAL_DAYS): Promise<number> {
    const now = this.clock.now();
    const rows = await this.db
      .update(organizations)
      .set({ trialEndsAt: new Date(now.getTime() + days * DAY), trialNotice7At: null, trialNotice3At: null })
      .where(
        and(
          eq(organizations.status, "trialing"),
          isNull(organizations.stripeSubscriptionId),
          isNull(organizations.deletedAt),
        ),
      )
      .returning();
    for (const org of rows) await this.notifyOwner(org, "billing.trial_ending", days);
    return rows.length;
  }
}
