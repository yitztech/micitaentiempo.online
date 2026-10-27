import { create } from "@bufbuild/protobuf";
import { timestampNow } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError, createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import {
  DomainEventSchema,
  EventIngressService as EventIngressDesc,
} from "@mcet/contracts/mcet/api/v1/event_ingress_pb";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BusinessProfileRepository } from "../src/businesses/business-profile.repository.js";
import { runMigrations } from "../src/db/migrate.js";
import * as schema from "../src/db/schema.js";
import { EventIngressService } from "../src/internal-rpc/event-ingress.service.js";
import { buildInternalServer } from "../src/internal-rpc/internal-rpc.server.js";
import { AUDIENCE_API, ISSUER_CALENDAR, signInternal } from "../src/internal-rpc/jwt.js";
import { RealtimeBus } from "../src/internal-rpc/realtime.bus.js";

const secret = "secreto-calendar-a-api-de-al-menos-32-caracteres";
let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let server: FastifyInstance;
let baseUrl: string;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.6-alpine3.24").start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await runMigrations(pool, { log: () => undefined });
  const db = drizzle(pool, { schema });
  const profiles = new BusinessProfileRepository(db);
  const ingress = new EventIngressService(db, new RealtimeBus(), profiles);
  server = await buildInternalServer(secret, ingress);
  baseUrl = await server.listen({ host: "127.0.0.1", port: 0 });
}, 120_000);

afterAll(async () => {
  await server?.close();
  await pool?.end();
  await container?.stop();
});

function client(token?: string) {
  const transport = createConnectTransport({
    baseUrl,
    httpVersion: "1.1",
    interceptors: [
      (next) => async (req) => {
        if (token) req.header.set("Authorization", `Bearer ${token}`);
        return next(req);
      },
    ],
  });
  return createClient(EventIngressDesc, transport);
}

describe("EventIngress", () => {
  it("guarda una vez y marca los reintentos como duplicados", async () => {
    const token = await signInternal(
      secret,
      { role: "system" },
      { issuer: ISSUER_CALENDAR, audience: AUDIENCE_API },
    );
    const event = create(DomainEventSchema, {
      eventId: "0192f3c4-0000-7000-8000-000000000002",
      type: "event.updated",
      occurredAt: timestampNow(),
      orgId: "org-1",
      calendarId: "cal-1",
      version: 2,
    });
    const first = await client(token).publish({ event });
    const second = await client(token).publish({ event });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    const rows = await pool.query("select type, version from app.inbound_events where event_id = $1", [
      event.eventId,
    ]);
    expect(rows.rows).toEqual([{ type: "event.updated", version: 2 }]);
  });

  it("rechaza llamadas sin el JWT del motor", async () => {
    const event = create(DomainEventSchema, { eventId: "x", type: "y" });
    await expect(client().publish({ event })).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.Unauthenticated,
    );
    const ajeno = await signInternal(secret, { role: "system" }, { issuer: "otro", audience: AUDIENCE_API });
    await expect(client(ajeno).publish({ event })).rejects.toSatisfy(
      (err: unknown) => err instanceof ConnectError && err.code === Code.Unauthenticated,
    );
  });

  it("recibe y proyecta snapshots de calendario aplicando la revisión monótona", async () => {
    const orgId = "019a0000-0000-7000-8000-000000000010";
    const calendarId = "019a0000-0000-7000-8000-000000000011";
    await pool.query("INSERT INTO app.users(id,name,email) VALUES ('owner-snap','Snap','snap@example.com')");
    await pool.query(
      "INSERT INTO app.organizations(id,name,owner_user_id,plan) VALUES ($1,'Org Snap','owner-snap','branches')",
      [orgId],
    );

    const token = await signInternal(
      secret,
      { role: "system", via: "system" },
      { issuer: ISSUER_CALENDAR, audience: AUDIENCE_API },
    );
    const event = create(DomainEventSchema, {
      eventId: "019a0000-0000-7000-8000-000000000012",
      type: "calendar.snapshot",
      orgId,
      calendarId,
      version: 1,
      occurredAt: timestampNow(),
      subject: {
        schemaVersion: 1,
        aggregateVersion: 1,
        state: "active",
        slug: "sede-snap",
        hasActiveServices: true,
      },
    });

    const res = await client(token).publish({ event });
    expect(res.duplicate).toBe(false);

    const rows = await pool.query(
      "SELECT aggregate_version, state, slug, has_active_services FROM app.business_calendar_projection WHERE calendar_id = $1",
      [calendarId],
    );
    expect(rows.rows).toEqual([
      { aggregate_version: 1, state: "active", slug: "sede-snap", has_active_services: true },
    ]);
  });
});
