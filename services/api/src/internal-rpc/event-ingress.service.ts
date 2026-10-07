import { toJson } from "@bufbuild/protobuf";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { type DomainEvent, DomainEventSchema } from "@mcet/contracts/mcet/api/v1/event_ingress_pb";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { type Database, DB } from "../db/db.module.js";
import { customerLinks, inboundEvents } from "../db/schema.js";
import { RealtimeBus } from "./realtime.bus.js";

/** Recibe eventos de dominio del motor; idempotente por event_id (ADR 0004). */
@Injectable()
export class EventIngressService {
  private readonly logger = new Logger(EventIngressService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly bus: RealtimeBus,
  ) {}

  /**
   * Devuelve true si el evento ya se había procesado. Se guarda primero y se marca `processed_at` al final:
   * si algo falla, el motor reintenta y se vuelve a procesar (todos los efectos son idempotentes).
   */
  async publish(event: DomainEvent): Promise<boolean> {
    if (!event.eventId || !event.type) throw new Error("evento sin id o sin tipo");
    await this.db
      .insert(inboundEvents)
      .values({
        eventId: event.eventId,
        type: event.type,
        orgId: event.orgId || null,
        calendarId: event.calendarId || null,
        occurredAt: event.occurredAt ? timestampDate(event.occurredAt) : new Date(),
        version: event.version || 1,
        payload: toJson(DomainEventSchema, event) as object,
      })
      .onConflictDoNothing({ target: inboundEvents.eventId });
    const [row] = await this.db
      .select({ processedAt: inboundEvents.processedAt })
      .from(inboundEvents)
      .where(eq(inboundEvents.eventId, event.eventId));
    const duplicate = Boolean(row?.processedAt);
    this.logger.debug({ eventId: event.eventId, type: event.type, duplicate }, "evento de dominio recibido");
    if (duplicate) return true;
    await this.apply(event);
    await this.bus.dispatch(event);
    if (event.calendarId) {
      const id = event.subject?.event_id;
      this.bus.publish({
        type: event.type,
        calendarId: event.calendarId,
        eventId: typeof id === "string" ? id : undefined,
        actorUserId: event.actor?.userId || undefined,
      });
    }
    await this.db
      .update(inboundEvents)
      .set({ processedAt: new Date() })
      .where(eq(inboundEvents.eventId, event.eventId));
    return false;
  }

  /** Efectos del negocio previos a los avisos (vincular al cliente final con la organización). */
  private async apply(event: DomainEvent): Promise<void> {
    if (event.type !== "booking.created" || !event.orgId || !event.subject) return;
    const subject = event.subject;
    const userId = typeof subject.customer_user_id === "string" ? subject.customer_user_id : "";
    if (!userId) return;
    const locale = subject.attendee_locale === "en" ? "en" : "es";
    // El cliente final queda vinculado a la organización: el panel lo ve en «Clientes».
    await this.db
      .insert(customerLinks)
      .values({ orgId: event.orgId, userId, locale })
      .onConflictDoUpdate({
        target: [customerLinks.orgId, customerLinks.userId],
        set: { lastBookingAt: new Date(), locale },
      });
  }
}
