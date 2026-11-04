import { OfflineChangesPage } from "@mcet/schemas";
import { BadRequestException, GoneException } from "@nestjs/common";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../../src/audit/audit.service.js";
import { BusinessImageService } from "../../src/businesses/business-image.service.js";
import { BusinessProfileRepository } from "../../src/businesses/business-profile.repository.js";
import { BusinessProfileService } from "../../src/businesses/business-profile.service.js";
import { OfflineSyncService } from "../../src/businesses/offline-sync.service.js";
import { AppClock } from "../../src/common/clock.js";
import type { Env } from "../../src/config/env.js";
import { runMigrations } from "../../src/db/migrate.js";
import * as schema from "../../src/db/schema.js";
import { stopDatabase } from "../helpers/database.js";

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let sync: OfflineSyncService;
let profiles: BusinessProfileService;
const clock = new AppClock();

const ORG_A = "019a0000-0000-7000-8000-0000000c0a01";
const ORG_B = "019a0000-0000-7000-8000-0000000c0b01";
const loc = (n: number) => `019a0000-0000-7000-8000-0000000c1${String(n).padStart(3, "0")}`;

async function addLocation(org: string, id: string, name = "Sede") {
  await pool.query(
    "INSERT INTO app.business_locations(id, org_id, name, country, locality, locality_key) VALUES ($1,$2,$3,'ES','Madrid','madrid')",
    [id, org, name],
  );
}
const changes = async () =>
  (await pool.query("SELECT resource, resource_id, op FROM app.sync_changes ORDER BY seq")).rows as Array<{
    resource: string;
    resource_id: string;
    op: string;
  }>;
const page = (user: string, cursor?: string, limit = 100) => sync.page(user, cursor, limit);
/** Descarga completa: snapshot hasta el final. */
async function snapshot(user: string, limit = 100) {
  let result = await page(user, undefined, limit);
  const items = [...result.items];
  while (result.hasMore) {
    result = await page(user, result.nextCursor, limit);
    items.push(...result.items);
  }
  return { items, cursor: result.nextCursor };
}
async function rejection<T>(promise: Promise<T>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("se esperaba un rechazo");
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.6-alpine3.24").start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await runMigrations(pool, { log() {} });
  db = drizzle(pool, { schema });
  const audit = new AuditService(db);
  profiles = new BusinessProfileService(
    db,
    new BusinessProfileRepository(db),
    audit,
    new BusinessImageService({ UPLOADS_DIR: "/tmp" } as unknown as Env),
  );
  sync = new OfflineSyncService(
    db,
    { BETTER_AUTH_SECRET: "secreto-de-prueba-del-feed-offline-0123456789" } as Env,
    clock,
    profiles,
  );
  await pool.query(
    "INSERT INTO app.users(id,name,email) VALUES ('owner-a','Ana','a@example.com'),('owner-b','Bea','b@example.com')",
  );
});

beforeEach(async () => {
  clock.set(null);
  await pool.query("DELETE FROM app.user_restrictions");
  await pool.query("DELETE FROM app.organizations WHERE id IN ($1,$2)", [ORG_A, ORG_B]);
  await pool.query(
    "INSERT INTO app.organizations(id,name,owner_user_id,plan,status) VALUES ($1,'Clínica','owner-a','branches','active'),($2,'Estudio','owner-b','branches','active')",
    [ORG_A, ORG_B],
  );
  await pool.query(
    "INSERT INTO app.business_profiles(org_id, display_name) VALUES ($1,'Clínica Dental'),($2,'Estudio Creativo')",
    [ORG_A, ORG_B],
  );
  await pool.query("DELETE FROM app.sync_changes");
});

afterAll(async () => {
  await stopDatabase(pool, container);
});

describe("C02a — registro transaccional de cambios", () => {
  it("altas, modificaciones y bajas de perfil y sedes quedan registradas con su tipo", async () => {
    await addLocation(ORG_A, loc(1));
    await pool.query("UPDATE app.business_profiles SET display_name = 'Nuevo' WHERE org_id = $1", [ORG_A]);
    await pool.query("UPDATE app.business_locations SET name = 'Otra' WHERE id = $1", [loc(1)]);
    await pool.query("DELETE FROM app.business_locations WHERE id = $1", [loc(1)]);
    expect(await changes()).toEqual([
      { resource: "business_location", resource_id: loc(1), op: "upsert" },
      { resource: "business_profile", resource_id: ORG_A, op: "upsert" },
      { resource: "business_location", resource_id: loc(1), op: "upsert" },
      { resource: "business_location", resource_id: loc(1), op: "delete" },
    ]);
  });

  it("un rollback no publica ningún cambio", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE app.business_profiles SET display_name = 'Descartado' WHERE org_id = $1", [
        ORG_A,
      ]);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    expect(await changes()).toEqual([]);
  });

  it("borrar la organización en cascada deja bajas del perfil y de cada sede", async () => {
    await addLocation(ORG_A, loc(1));
    await addLocation(ORG_A, loc(2));
    await pool.query("DELETE FROM app.sync_changes");
    await pool.query("DELETE FROM app.organizations WHERE id = $1", [ORG_A]);
    const rows = await changes();
    expect(rows.every((r) => r.op === "delete")).toBe(true);
    expect(rows.map((r) => r.resource_id).sort()).toEqual([ORG_A, loc(1), loc(2)].sort());
  });

  it("las rutas reales de escritura del servicio también quedan cubiertas", async () => {
    await profiles.createLocation(
      "owner-a",
      "019a0000-0000-7000-8000-0000000c2001",
      {
        expectedVersion: 1,
        location: {
          name: "Sede nueva",
          country: "ES",
          region: "",
          locality: "Madrid",
          address: "",
          postalCode: "",
          addressVisibility: "locality",
          latitude: null,
          longitude: null,
        },
      },
      "127.0.0.1",
    );
    const rows = await changes();
    expect(rows.some((r) => r.resource === "business_location" && r.op === "upsert")).toBe(true);
    expect(rows.some((r) => r.resource === "business_profile" && r.op === "upsert")).toBe(true);
  });
});

describe("C02b — endpoint de cambios", () => {
  it("snapshot en páginas inicial, intermedia y final, y después cambios sin duplicar", async () => {
    await addLocation(ORG_A, loc(1));
    await addLocation(ORG_A, loc(2));
    const first = await page("owner-a", undefined, 2);
    expect(OfflineChangesPage.safeParse(first).success).toBe(true);
    expect(first).toMatchObject({ mode: "snapshot", reset: true, hasMore: true, snapshotComplete: false });
    expect(first.items.map((i) => `${i.resource}:${i.op}`)).toEqual([
      "business_profile:upsert",
      "business_location:upsert",
    ]);
    expect(first.resources).toEqual(["business_profile", "business_location"]);
    expect(first.unsupported).toContain("bookings");

    const last = await page("owner-a", first.nextCursor, 2);
    expect(last).toMatchObject({ mode: "snapshot", reset: false, hasMore: false, snapshotComplete: true });
    expect(last.items.map((i) => i.id)).toEqual([loc(2)]);

    const caughtUp = await page("owner-a", last.nextCursor);
    expect(caughtUp).toMatchObject({ mode: "changes", hasMore: false, items: [] });
    expect(typeof caughtUp.nextCursor).toBe("string");
    // Repetir el mismo cursor es seguro: misma respuesta, sin duplicados.
    const again = await page("owner-a", last.nextCursor);
    expect(again.items).toEqual([]);
  });

  it("una modificación y una baja aparecen, con el contenido actual y revisión creciente", async () => {
    await addLocation(ORG_A, loc(1));
    await addLocation(ORG_A, loc(2));
    const { cursor } = await snapshot("owner-a");
    await pool.query("UPDATE app.business_locations SET name = 'Renombrada' WHERE id = $1", [loc(1)]);
    await pool.query("DELETE FROM app.business_locations WHERE id = $1", [loc(2)]);
    const result = await page("owner-a", cursor);
    const byId = new Map(result.items.map((i) => [i.id, i]));
    const updated = byId.get(loc(1));
    expect(updated).toMatchObject({ op: "upsert", resource: "business_location" });
    expect(
      updated?.op === "upsert" && updated.resource === "business_location" && updated.data.location.name,
    ).toBe("Renombrada");
    expect(byId.get(loc(2))).toMatchObject({ op: "delete" });
    expect(byId.get(loc(2))?.revision).toBeGreaterThan(updated?.revision ?? 0);
  });

  it("varias ediciones del mismo recurso se colapsan en un solo elemento", async () => {
    const { cursor } = await snapshot("owner-a");
    for (const name of ["Uno", "Dos", "Tres"]) {
      await pool.query("UPDATE app.business_profiles SET display_name = $2 WHERE org_id = $1", [ORG_A, name]);
    }
    const result = await page("owner-a", cursor);
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(
      item?.op === "upsert" && item.resource === "business_profile" && item.data.content.displayName,
    ).toBe("Tres");
  });

  it("un rollback no entrega nada", async () => {
    const { cursor } = await snapshot("owner-a");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE app.business_profiles SET display_name = 'Fantasma' WHERE org_id = $1", [
        ORG_A,
      ]);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    expect((await page("owner-a", cursor)).items).toEqual([]);
  });

  it("transacciones que confirman en distinto orden: ninguna se salta y el horizonte las retiene", async () => {
    await addLocation(ORG_A, loc(1));
    const feedA = await snapshot("owner-a");
    const feedB = await snapshot("owner-b");
    const slow = await pool.connect();
    try {
      // La transacción lenta (otra organización) obtiene el seq menor pero confirma la última.
      // (Dentro de una misma organización el trigger de cuotas ya serializa con FOR UPDATE sobre el perfil.)
      await slow.query("BEGIN");
      await slow.query("UPDATE app.business_profiles SET display_name = 'Lenta' WHERE org_id = $1", [ORG_B]);
      // La rápida (seq mayor) confirma antes.
      await pool.query("UPDATE app.business_locations SET name = 'Rápida' WHERE id = $1", [loc(1)]);
      const seqs = (await pool.query("SELECT resource_id, seq::int FROM app.sync_changes ORDER BY seq")).rows;
      expect(seqs.at(-1)?.resource_id).toBe(loc(1));

      // Mientras haya una transacción anterior sin terminar no se entrega la posterior: sería una laguna.
      expect((await page("owner-a", feedA.cursor)).items).toEqual([]);

      await slow.query("COMMIT");
    } finally {
      // Si una aserción falla con la transacción abierta, no debe quedar bloqueando el resto de pruebas.
      await slow.query("ROLLBACK").catch(() => undefined);
      slow.release();
    }
    const afterA = await page("owner-a", feedA.cursor);
    expect(afterA.items.map((i) => i.id)).toEqual([loc(1)]);
    const afterB = await page("owner-b", feedB.cursor);
    expect(afterB.items.map((i) => i.id)).toEqual([ORG_B]);
  });

  it("la paginación de cambios con límite pequeño recorre todo sin perder ni repetir", async () => {
    const { cursor } = await snapshot("owner-a");
    for (let i = 1; i <= 5; i++) await addLocation(ORG_A, loc(i), `Sede ${i}`);
    const seen: string[] = [];
    let next = cursor;
    for (let guard = 0; guard < 20; guard++) {
      const result = await page("owner-a", next, 2);
      seen.push(...result.items.filter((i) => i.resource === "business_location").map((i) => i.id));
      next = result.nextCursor;
      if (!result.hasMore) break;
    }
    expect([...new Set(seen)].sort()).toEqual([1, 2, 3, 4, 5].map(loc).sort());
  });

  it("la cuenta B no lee cambios de A y un cursor de A no sirve a B", async () => {
    await addLocation(ORG_A, loc(1));
    const a = await snapshot("owner-a");
    const b = await snapshot("owner-b");
    expect(b.items.map((i) => i.id)).toEqual([ORG_B]);
    expect(JSON.stringify(b.items)).not.toContain("Clínica");
    const error = await rejection(page("owner-b", a.cursor));
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: "invalid_cursor" });
    // Y el cambio de A no aparece en el feed de B.
    await pool.query("UPDATE app.business_locations SET name = 'Privada de A' WHERE id = $1", [loc(1)]);
    const feedB = await page("owner-b", b.cursor);
    expect(JSON.stringify(feedB)).not.toContain("Privada de A");
  });

  it("cursores falsificados, mal formados o manipulados devuelven 400 invalid_cursor (no 500 ni lista vacía)", async () => {
    const { cursor } = await snapshot("owner-a");
    const [body = "", signature = ""] = cursor.split(".");
    const tampered = `${Buffer.from(JSON.stringify({ v: 1, a: "owner-a", h: "x", iat: 0, exp: 9999999999, p: { k: "c", t: "1", s: 0 } })).toString("base64url")}.${signature}`;
    for (const bad of ["basura", "a.b.c", `${body}.`, tampered, `${body}x.${signature}`, ""]) {
      const error = await rejection(page("owner-a", bad));
      expect(error, bad).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({ code: "invalid_cursor" });
    }
  });

  it("un cursor caducado devuelve 410 sync_cursor_expired y el snapshot siguiente recupera todo", async () => {
    const { cursor } = await snapshot("owner-a");
    clock.set(new Date(Date.now() + 31 * 86_400_000));
    const error = await rejection(page("owner-a", cursor));
    expect(error).toBeInstanceOf(GoneException);
    expect((error as GoneException).getResponse()).toMatchObject({
      code: "sync_cursor_expired",
      errors: [{ path: "cursor", code: "expired" }],
    });
    const recovered = await page("owner-a");
    expect(recovered).toMatchObject({ reset: true, mode: "snapshot" });
    expect(recovered.items.map((i) => i.id)).toEqual([ORG_A]);
  });

  it("seguir un snapshot sin terminar no renueva el plazo de su marca de agua", async () => {
    await addLocation(ORG_A, loc(901));
    await addLocation(ORG_A, loc(902));
    const start = Date.now();
    const first = await page("owner-a", undefined, 1);
    clock.set(new Date(start + 29 * 86_400_000));
    const second = await page("owner-a", first.nextCursor, 1);
    expect(second.hasMore).toBe(true);
    clock.set(new Date(start + 31 * 86_400_000));
    expect(await rejection(page("owner-a", second.nextCursor, 1))).toBeInstanceOf(GoneException);
  });

  it("el cursor final de un snapshot conserva la edad de su marca de agua", async () => {
    await addLocation(ORG_A, loc(903));
    const start = Date.now();
    const first = await page("owner-a", undefined, 1);
    clock.set(new Date(start + 29 * 86_400_000));
    const last = await page("owner-a", first.nextCursor, 100);
    expect(last.snapshotComplete).toBe(true);
    clock.set(new Date(start + 31 * 86_400_000));
    expect(await rejection(page("owner-a", last.nextCursor))).toBeInstanceOf(GoneException);
  });

  it("una página de cambios con más pendientes hereda el plazo y solo alcanzar el horizonte lo estrena", async () => {
    const start = Date.now();
    const { cursor } = await snapshot("owner-a");
    await addLocation(ORG_A, loc(904));
    await addLocation(ORG_A, loc(905));
    clock.set(new Date(start + 29 * 86_400_000));
    const partial = await page("owner-a", cursor, 1);
    expect(partial.hasMore).toBe(true);
    const current = await page("owner-a", cursor, 100);
    expect(current.hasMore).toBe(false);

    clock.set(new Date(start + 31 * 86_400_000));
    expect(await rejection(page("owner-a", partial.nextCursor, 1))).toBeInstanceOf(GoneException);
    await expect(page("owner-a", current.nextCursor)).resolves.toMatchObject({ mode: "changes" });
  });

  it("perder el permiso invalida el cursor y el snapshot ya no contiene el negocio", async () => {
    await addLocation(ORG_A, loc(1));
    const { cursor } = await snapshot("owner-a");
    await pool.query("UPDATE app.organizations SET deleted_at = now() WHERE id = $1", [ORG_A]);
    const error = await rejection(page("owner-a", cursor));
    expect(error).toBeInstanceOf(GoneException);
    expect((error as GoneException).getResponse()).toMatchObject({ errors: [{ code: "scope_changed" }] });
    const reset = await page("owner-a");
    expect(reset).toMatchObject({ reset: true, items: [], hasMore: false, snapshotComplete: true });
    // Aunque haya cambios posteriores del negocio, el actor ya no los recibe.
    await pool.query("UPDATE app.business_locations SET name = 'Tras la baja' WHERE id = $1", [loc(1)]);
    const after = await page("owner-a", reset.nextCursor);
    expect(JSON.stringify(after)).not.toContain("Tras la baja");
  });

  it("una cuenta restringida (bloqueada) deja de recibir datos privados", async () => {
    const { cursor } = await snapshot("owner-a");
    await pool.query(
      "INSERT INTO app.user_restrictions(user_id, reason, blocked_by) VALUES ('owner-a','test','admin')",
    );
    expect(await rejection(page("owner-a", cursor))).toBeInstanceOf(GoneException);
    expect((await page("owner-a")).items).toEqual([]);
  });

  it("la limpieza borra solo lo anterior a la retención", async () => {
    await addLocation(ORG_A, loc(1));
    await pool.query(
      "UPDATE app.sync_changes SET created_at = now() - interval '40 days' WHERE seq = (SELECT min(seq) FROM app.sync_changes)",
    );
    const before = (await changes()).length;
    expect(await sync.pruneChanges()).toBe(1);
    expect((await changes()).length).toBe(before - 1);
  });
});
