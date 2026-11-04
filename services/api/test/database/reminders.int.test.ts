import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/db/migrate.js";
import * as schema from "../../src/db/schema.js";
import { NotificationsService } from "../../src/notifications/notifications.service.js";
import { stopDatabase } from "../helpers/database.js";

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;

const ORG = "019a0000-0000-7000-8000-0000000007b1";
const CALENDAR = "019a0000-0000-7000-8000-0000000007b2";
const EVENT = "019a0000-0000-7000-8000-0000000007b3";
const START = new Date("2026-11-10T16:00:00.000Z");
const hoursBeforeStart = (hours: number) => new Date(START.getTime() - hours * 3_600_000);

function service(now: Date) {
  const rpc = {
    client: () => ({ getCalendar: async () => ({ name: "Consultas", slug: "consultas", timezone: "UTC" }) }),
  };
  return new NotificationsService(
    db,
    rpc as never,
    { handle() {} } as never,
    { now: () => now } as never,
    { APP_ENC_KEY: "clave-de-prueba" } as never,
  );
}

function booking(occurredAt?: Date) {
  return {
    type: "booking.created",
    orgId: ORG,
    calendarId: CALENDAR,
    occurredAt: occurredAt ? timestampFromDate(occurredAt) : undefined,
    subject: { event_id: EVENT, kind: "appointment", start: START.toISOString() },
  } as never;
}

const offsets = async () =>
  (
    await db
      .select({ offset: schema.reminders.offsetMin })
      .from(schema.reminders)
      .where(eq(schema.reminders.eventId, EVENT))
      .orderBy(asc(schema.reminders.offsetMin))
  ).map((row) => row.offset);

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.6-alpine3.24").start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await runMigrations(pool, { log() {} });
  db = drizzle(pool, { schema });
});

beforeEach(async () => {
  await pool.query("DELETE FROM app.reminders");
});

afterAll(async () => {
  await stopDatabase(pool, container);
});

describe("Recordatorios ante la entrega asíncrona de eventos (PostgreSQL real)", () => {
  it("conserva el recordatorio de 24 h aunque el evento llegue después de su vencimiento", async () => {
    await service(hoursBeforeStart(23)).onEvent(booking(hoursBeforeStart(48)));
    expect(await offsets()).toEqual([60, 1440]);
  });

  it("una reserva hecha dentro de las 24 h solo programa el de 1 h", async () => {
    await service(hoursBeforeStart(5)).onEvent(booking(hoursBeforeStart(5)));
    expect(await offsets()).toEqual([60]);
  });

  it("no programa nada si el evento llega cuando la cita ya empezó", async () => {
    await service(new Date(START.getTime() + 60_000)).onEvent(booking(hoursBeforeStart(48)));
    expect(await offsets()).toEqual([]);
  });

  it("sin fecha de origen usa la hora de llegada", async () => {
    await service(hoursBeforeStart(23)).onEvent(booking());
    expect(await offsets()).toEqual([60]);
  });
});
