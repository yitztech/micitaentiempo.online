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
  const ingress = new EventIngressService(drizzle(pool, { schema }), new RealtimeBus());
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
});
