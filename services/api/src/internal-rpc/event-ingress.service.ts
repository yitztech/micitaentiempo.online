import { toJson } from "@bufbuild/protobuf";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { type DomainEvent, DomainEventSchema } from "@mcet/contracts/mcet/api/v1/event_ingress_pb";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { type Database, DB } from "../db/db.module.js";
import { inboundEvents } from "../db/schema.js";

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
    return duplicate;
  }
}
