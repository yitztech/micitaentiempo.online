import { toJson } from "@bufbuild/protobuf";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { type DomainEvent, DomainEventSchema } from "@mcet/contracts/mcet/api/v1/event_ingress_pb";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { type Database, DB } from "../db/db.module.js";
import { customerLinks, inboundEvents } from "../db/schema.js";

/** Recibe eventos de dominio del motor; idempotente por event_id (ADR 0004). */
@Injectable()
export class EventIngressService {
  private readonly logger = new Logger(EventIngressService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  /** Devuelve true si el evento ya se había recibido. */
  async publish(event: DomainEvent): Promise<boolean> {
    if (!event.eventId || !event.type) throw new Error("evento sin id o sin tipo");
    const inserted = await this.db
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
      .onConflictDoNothing({ target: inboundEvents.eventId })
      .returning({ eventId: inboundEvents.eventId });
    const duplicate = inserted.length === 0;
    this.logger.debug({ eventId: event.eventId, type: event.type, duplicate }, "evento de dominio recibido");
    if (!duplicate) await this.apply(event);
    return duplicate;
  }

  /** Efectos del negocio que no dependen de avisos (los avisos llegan en F8). */
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
