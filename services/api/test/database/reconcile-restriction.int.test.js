import { PostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  PlatformDatabase,
  PlatformRestrictionNotFoundError,
  RestrictionReconciliationRequiredError,
} from "../../../admin/src/db/platform-db.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import { stopDatabase } from "../helpers/database.js";

const OWNER = "owner-s04";
const LIVE = "019a0000-0000-7000-8000-0000000007c1";
const CLOSED = "019a0000-0000-7000-8000-0000000007c2";

let container, pool, platform;

const organization = async (id) =>
  (await pool.query("SELECT * FROM app.organizations WHERE id = $1", [id])).rows[0];
const restriction = async () =>
  (await pool.query("SELECT * FROM app.user_restrictions WHERE user_id = $1", [OWNER])).rows[0];
const audits = async () =>
  (await pool.query("SELECT * FROM app.audit_log WHERE action = 'user.restriction.reconciled'")).rows;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.6-alpine3.24").start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await runMigrations(pool, { log() {} });
  await pool.query("INSERT INTO app.users (id,name,email) VALUES ($1,'Ana','s04@example.com')", [OWNER]);
  platform = new PlatformDatabase({ pg: {} }, pool);
});

beforeEach(async () => {
  await pool.query("DELETE FROM app.audit_log");
  await pool.query("DELETE FROM app.user_restrictions");
  await pool.query("DELETE FROM app.organizations WHERE owner_user_id = $1", [OWNER]);
  await pool.query(
    `INSERT INTO app.organizations (id,name,owner_user_id,plan,status,calendar_status_pending,deleted_at)
     VALUES ($1,'Viva',$3,'personal','suspended',false,NULL), ($2,'Cerrada',$3,'personal','suspended',false,now())`,
    [LIVE, CLOSED, OWNER],
  );
  await pool.query(
    "INSERT INTO app.user_restrictions (user_id,reason,blocked_by,reconciliation_required) VALUES ($1,'Histórica','legacy',true)",
    [OWNER],
  );
});

afterAll(async () => {
  await stopDatabase(pool, container);
});

describe("S04 — conciliación de suspensiones históricas (PostgreSQL real)", () => {
  it("desbloquear sigue rechazado hasta conciliar", async () => {
    await expect(platform.removeUserRestriction(OWNER, "admin")).rejects.toBeInstanceOf(
      RestrictionReconciliationRequiredError,
    );
    expect((await organization(LIVE)).status).toBe("suspended");
  });

  it("declara el estado económico y mantiene la cuenta bloqueada", async () => {
    const result = await platform.reconcileRestriction(OWNER, "read_only", "Revisé Stripe", "admin");

    expect(result).toMatchObject({ changed: true, organizationIds: [LIVE], calendarStatusPending: true });
    expect(await organization(LIVE)).toMatchObject({
      status: "read_only",
      past_due_since: null,
      calendar_status_pending: true,
    });
    expect(await restriction()).toMatchObject({ reconciliation_required: false, reason: "Histórica" });
    const [audit, ...rest] = await audits();
    expect(rest).toEqual([]);
    expect(JSON.stringify(audit)).toContain("Revisé Stripe");
  });

  it("past_due arranca el plazo de gracia y conserva el que ya hubiera", async () => {
    const since = new Date("2026-10-01T12:00:00.000Z");
    await pool.query("UPDATE app.organizations SET past_due_since = $2 WHERE id = $1", [LIVE, since]);
    await platform.reconcileRestriction(OWNER, "past_due", "Cobro fallido", "admin");
    expect(await organization(LIVE)).toMatchObject({ status: "past_due", past_due_since: since });
  });

  it("no reabre organizaciones cerradas", async () => {
    await platform.reconcileRestriction(OWNER, "active", "Cobro al día", "admin");
    expect((await organization(CLOSED)).status).toBe("suspended");
  });

  it("repetirla no cambia nada y después se puede desbloquear sin tocar el estado económico", async () => {
    await platform.reconcileRestriction(OWNER, "read_only", "Revisé Stripe", "admin");
    const repeated = await platform.reconcileRestriction(OWNER, "active", "Segundo intento", "admin");
    expect(repeated.changed).toBe(false);
    expect((await organization(LIVE)).status).toBe("read_only");
    expect(await audits()).toHaveLength(1);

    const removed = await platform.removeUserRestriction(OWNER, "admin");
    expect(removed.changed).toBe(true);
    expect((await organization(LIVE)).status).toBe("read_only");
  });

  it("sin restricción responde con un error definido", async () => {
    await pool.query("DELETE FROM app.user_restrictions");
    await expect(platform.reconcileRestriction(OWNER, "active", "x", "admin")).rejects.toBeInstanceOf(
      PlatformRestrictionNotFoundError,
    );
  });
});
