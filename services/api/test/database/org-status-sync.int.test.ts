import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BillingService } from "../../src/billing/billing.service.js";
import { runMigrations } from "../../src/db/migrate.js";
import * as schema from "../../src/db/schema.js";

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;

const ORG = "019a0000-0000-7000-8000-0000000007a1";
const noop = { record: async () => undefined };
const clock = { now: () => new Date("2026-09-14T12:00:00Z") };

function service(setOrgStatus: (req: { orgId: string; status: string }) => Promise<unknown>) {
  const rpc = { client: () => ({ setOrgStatus }) };
  return new BillingService(db, {} as never, rpc as never, clock as never, noop as never, noop as never);
}

const estado = async () =>
  (await db.select().from(schema.organizations).where(eq(schema.organizations.id, ORG)))[0];

/** Lo mismo que hace el panel de administración en una transacción (services/admin platform-db). */
async function bloquear() {
  await pool.query(
    "INSERT INTO app.user_restrictions(user_id, reason, blocked_by) VALUES ('owner-s07','S07','admin-ci') ON CONFLICT DO NOTHING",
  );
  await pool.query("UPDATE app.organizations SET calendar_status_pending = true WHERE id = $1", [ORG]);
}
async function desbloquear() {
  await pool.query("DELETE FROM app.user_restrictions WHERE user_id = 'owner-s07'");
  await pool.query("UPDATE app.organizations SET calendar_status_pending = true WHERE id = $1", [ORG]);
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.6-alpine3.24").start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await runMigrations(pool, { log() {} });
  db = drizzle(pool, { schema });
  await pool.query("INSERT INTO app.users(id, name, email) VALUES ('owner-s07','Ana','s07@example.com')");
});

beforeEach(async () => {
  await pool.query("DELETE FROM app.user_restrictions");
  await pool.query("DELETE FROM app.organizations WHERE id = $1", [ORG]);
  await pool.query(
    "INSERT INTO app.organizations(id, name, owner_user_id, plan, status, calendar_status_pending) VALUES ($1,'Clínica','owner-s07','personal','active', false)",
    [ORG],
  );
});

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe("S07 — estado efectivo proyectado al motor (PostgreSQL real)", () => {
  it("motor caído → bloqueo persistido → reintento: el marcador sigue hasta que el motor confirma suspended", async () => {
    await bloquear();
    const send = vi.fn().mockRejectedValueOnce(new Error("motor no disponible")).mockResolvedValueOnce({});
    const billing = service(send);
    await expect(billing.syncCalendarStatus(ORG)).rejects.toThrow("motor no disponible");
    expect((await estado())?.calendarStatusPending).toBe(true);
    expect((await estado())?.status).toBe("active");
    await billing.reconcileCalendarStatuses();
    expect(send).toHaveBeenLastCalledWith({ orgId: ORG, status: "suspended" }, expect.anything());
    expect((await estado())?.calendarStatusPending).toBe(false);
    expect((await estado())?.status).toBe("active");
  });

  it("un webhook durante el bloqueo guarda el estado económico y mantiene la suspensión efectiva", async () => {
    await bloquear();
    const send = vi.fn().mockResolvedValue({});
    const billing = service(send);
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, ORG));
    if (!org) throw new Error("falta la organización");
    await billing.setStatus(org, "past_due", undefined, { plan: "branches" });
    expect(send).toHaveBeenLastCalledWith({ orgId: ORG, status: "suspended" }, expect.anything());
    const guardada = await estado();
    expect(guardada?.status).toBe("past_due");
    expect(guardada?.plan).toBe("branches");
    const restriccion = await pool.query("SELECT 1 FROM app.user_restrictions WHERE user_id='owner-s07'");
    expect(restriccion.rowCount).toBe(1);
  });

  it.each(["past_due", "read_only", "trialing"] as const)(
    "desbloquear una organización %s conserva sus restricciones de pago",
    async (status) => {
      await pool.query("UPDATE app.organizations SET status = $2 WHERE id = $1", [ORG, status]);
      await bloquear();
      const send = vi.fn().mockResolvedValue({});
      const billing = service(send);
      await billing.syncCalendarStatus(ORG);
      expect(send).toHaveBeenLastCalledWith({ orgId: ORG, status: "suspended" }, expect.anything());
      await desbloquear();
      await billing.syncCalendarStatus(ORG);
      expect(send).toHaveBeenLastCalledWith({ orgId: ORG, status }, expect.anything());
      expect((await estado())?.status).toBe(status);
    },
  );

  it("no proyecta organizaciones cerradas", async () => {
    await pool.query("UPDATE app.organizations SET deleted_at = now() WHERE id = $1", [ORG]);
    await bloquear();
    const send = vi.fn().mockResolvedValue({});
    await service(send).syncCalendarStatus(ORG);
    expect(send).not.toHaveBeenCalled();
  });

  it("un bloqueo que llega durante un envío en curso no queda sin proyectar", async () => {
    let liberar: () => void = () => undefined;
    const puerta = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const enviados: string[] = [];
    let llamadas = 0;
    const send = async (req: { status: string }) => {
      enviados.push(req.status);
      if (llamadas++ === 0) await puerta; // el primer envío (estado antiguo) queda en vuelo
    };
    const billing = service(send);
    await pool.query("UPDATE app.organizations SET calendar_status_pending = true WHERE id = $1", [ORG]);

    const primero = billing.syncCalendarStatus(ORG);
    await vi.waitFor(() => expect(enviados).toEqual(["active"]));
    const admin = bloquear(); // espera el candado de la fila hasta que termine el primer envío
    await new Promise((r) => setTimeout(r, 200));
    liberar();
    await Promise.all([primero, admin]);

    expect((await estado())?.calendarStatusPending).toBe(true);
    await billing.reconcileCalendarStatuses();
    expect(enviados.at(-1)).toBe("suspended");
    expect((await estado())?.calendarStatusPending).toBe(false);
  });
});
