import { pgSchema, text, timestamp } from "drizzle-orm/pg-core";

export const app = pgSchema("app");

/** Datos de la instalación (versión del esquema, fecha de alta…). */
export const systemInfo = app.table("system_info", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
