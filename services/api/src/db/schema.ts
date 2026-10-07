import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

export const app = pgSchema("app");

/** Datos de la instalación (versión del esquema, fecha de alta…). */
export const systemInfo = app.table("system_info", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Eventos de dominio recibidos del motor; event_id único garantiza idempotencia (ADR 0004). */
export const inboundEvents = app.table(
  "inbound_events",
  {
    eventId: text("event_id").primaryKey(),
    type: text("type").notNull(),
    orgId: text("org_id"),
    calendarId: text("calendar_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    version: integer("version").notNull().default(1),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [index("inbound_events_pending").on(t.receivedAt).where(sql`processed_at is null`)],
);
