import { BadRequestException, ForbiddenException, GoneException, NotFoundException } from "@nestjs/common";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import type { FastifyReply } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "../../src/auth/auth.registry.js";
import { OfflineController } from "../../src/businesses/offline.controller.js";
import { runMigrations } from "../../src/db/migrate.js";
import * as schema from "../../src/db/schema.js";

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let controller: OfflineController;

const orgA = "019a0000-0000-7000-8000-000000000010";
const op1 = "019a0000-0000-7000-8000-000000000091";
const opExpired = "019a0000-0000-7000-8000-000000000092";

const mockReply = () =>
  ({
    header: () => {},
  }) as unknown as FastifyReply;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.6-alpine3.24").start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await runMigrations(pool, { log() {} });

  db = drizzle(pool, { schema });
  controller = new OfflineController(db);

  await pool.query(
    "INSERT INTO app.users(id,name,email) VALUES ('user-a','Ana','a@example.com'),('user-b','Bea','b@example.com')",
  );
  await pool.query(
    "INSERT INTO app.organizations(id,name,owner_user_id,plan,status) VALUES ($1,'Org A','user-a','personal','active')",
    [orgA],
  );

  // Inserta operación reciente
  await pool.query(
    `INSERT INTO app.offline_operations(operation_id, org_id, actor_user_id, action, request_hash, response_status, response_body, created_at)
     VALUES ($1, $2, 'user-a', 'profile.update', 'hash-1', 200, '{"displayName":"Clínica Sol"}', NOW())`,
    [op1, orgA],
  );

  // Inserta operación expirada (> 90 días atrás)
  await pool.query(
    `INSERT INTO app.offline_operations(operation_id, org_id, actor_user_id, action, request_hash, response_status, response_body, created_at)
     VALUES ($1, $2, 'user-a', 'profile.update', 'hash-old', 200, '{"displayName":"Clínica Antigua"}', NOW() - INTERVAL '95 days')`,
    [opExpired, orgA],
  );
});

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe("API Offline de operaciones y recibos (C8b)", () => {
  const userA: SessionUser = {
    id: "user-a",
    email: "a@example.com",
    name: "Ana",
    emailVerified: true,
    locale: "es",
    timezone: "America/Mexico_City",
  };
  const userB: SessionUser = {
    id: "user-b",
    email: "b@example.com",
    name: "Bea",
    emailVerified: true,
    locale: "es",
    timezone: "America/Mexico_City",
  };

  it("recupera el recibo de una operación propia comprometida", async () => {
    const res = await controller.getOperation(userA, op1, mockReply());
    expect(res).toEqual({
      operationId: op1,
      action: "profile.update",
      status: 200,
      body: { displayName: "Clínica Sol" },
      createdAt: expect.any(String),
    });
  });

  it("rechaza consultar operaciones ajenas con 403 Forbidden", async () => {
    await expect(controller.getOperation(userB, op1, mockReply())).rejects.toThrow(ForbiddenException);
  });

  it("devuelve 404 para una operación inexistente", async () => {
    const nonexistent = "019a0000-0000-7000-8000-000000000999";
    await expect(controller.getOperation(userA, nonexistent, mockReply())).rejects.toThrow(NotFoundException);
  });

  it("rechaza un identificador de operación no UUID con 400 Bad Request", async () => {
    await expect(controller.getOperation(userA, "invalido-no-uuid", mockReply())).rejects.toThrow(
      BadRequestException,
    );
  });

  it("devuelve 410 Gone si el recibo de la operación ha caducado (> 90 días)", async () => {
    await expect(controller.getOperation(userA, opExpired, mockReply())).rejects.toThrow(GoneException);
  });

  it("permite consultar cambios incrementales del actor", async () => {
    const changes = await controller.getChanges(userA, { limit: 10 }, mockReply());
    expect(changes).toMatchObject({
      items: [],
      nextCursor: null,
      serverTime: expect.any(String),
    });
  });
});
