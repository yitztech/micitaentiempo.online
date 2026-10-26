import { readdir, readFile } from "node:fs/promises";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/db/migrate.ts";

let container, pool;
beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.6-alpine3.24").start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await runMigrations(pool, { log() {} });
  await runMigrations(pool, { log() {} }); // También verifica un segundo arranque.
  await pool.query("CREATE EXTENSION btree_gist; CREATE SCHEMA calendar");
  const client = await pool.connect();
  try {
    await client.query("SET search_path TO calendar, public");
    const directory = new URL("../../../calendar/internal/db/migrations/", import.meta.url);
    for (const file of (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort()) {
      const sql = await readFile(new URL(file, directory), "utf8");
      await client.query(sql.split("-- +goose Down")[0]);
    }
    await client.query(
      "INSERT INTO org_status (org_id,status) VALUES ('0192f3c4-0000-7000-8000-00000000aaaa','active')",
    );
    await client.query(
      "INSERT INTO calendars (id,org_id,slug,name,timezone) VALUES ('0192f3c4-0000-7000-8000-00000000bbbb','0192f3c4-0000-7000-8000-00000000aaaa','consultas','Consultas','America/Mexico_City')",
    );
  } finally {
    client.release();
  }
});
afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

let seq = 0;
async function insertName(name) {
  const id = `user-${++seq}`;
  return pool.query("INSERT INTO app.users (id,name,email) VALUES ($1,$2,$3)", [
    id,
    name,
    `${id}@example.com`,
  ]);
}
describe("SQL directo, sin pasar por Zod", () => {
  it("admite nombres internacionales y el estado sin nombre de OTP", async () => {
    for (const name of ["", "Ana López O’Connor", "李 小龍", "Á".repeat(100), "🙂".repeat(50)])
      await insertName(name);
  });
  it.each([" ", "x".repeat(101), "🙂".repeat(51), "A\nB", "A\u0085B", "A\u202eB", "<script>"])(
    "rechaza nombre inválido %j",
    async (name) => {
      await expect(insertName(name)).rejects.toMatchObject({ code: "23514" });
    },
  );
  it("rechaza edición inválida sin modificar el valor anterior", async () => {
    await pool.query("INSERT INTO app.users (id,name,email) VALUES ('edit','Ana','edit@example.com')");
    await expect(
      pool.query("UPDATE app.users SET name = $1 WHERE id = 'edit'", ["x".repeat(101)]),
    ).rejects.toMatchObject({ code: "23514" });
    expect((await pool.query("SELECT name FROM app.users WHERE id='edit'")).rows[0].name).toBe("Ana");
  });
  it("mantiene unicidad y claves foráneas", async () => {
    await expect(
      pool.query("INSERT INTO app.users(id,name,email) VALUES ('dup','Ana','edit@example.com')"),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      pool.query(
        "INSERT INTO app.organizations(id,name,owner_user_id,plan) VALUES ('org','Negocio','inexistente','personal')",
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      pool.query(
        "INSERT INTO app.organizations(id,name,owner_user_id,plan) VALUES ('org',$1,'edit','personal')",
        ["x".repeat(121)],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("valida nombres y descripciones JSON en el motor", async () => {
    const insert = (name, description = {}) =>
      pool.query(
        "INSERT INTO calendar.services(calendar_id,name,description,duration_min) VALUES ('0192f3c4-0000-7000-8000-00000000bbbb',$1,$2,30)",
        [JSON.stringify(name), JSON.stringify(description)],
      );
    await insert({ es: "Consulta", en: "Consultation" }, { es: "Notas\n\tpermitidas" });
    await insert({ es: "Sin descripción" }, null);
    for (const name of [{ es: "x".repeat(121) }, { es: 123 }, ["Consulta"], { es: "A\nB" }])
      await expect(insert(name)).rejects.toMatchObject({ code: "23514" });
    await expect(insert({ es: "Consulta" }, { es: "x".repeat(1001) })).rejects.toMatchObject({
      code: "23514",
    });
  });
  it("valida también el texto de las plantillas de series", async () => {
    const insert = (template) =>
      pool.query(
        `INSERT INTO calendar.series(calendar_id,kind,rrule,dtstart_local,tzid,duration_min,materialized_until,created_by,template) VALUES ('0192f3c4-0000-7000-8000-00000000bbbb','appointment','FREQ=WEEKLY;COUNT=2','2026-10-20 10:00','UTC',30,'2026-11-01','0192f3c4-0000-7000-8000-00000000aaaa',$1)`,
        [JSON.stringify(template)],
      );
    await insert({ title: "Consulta", attendee: { name: "Ana López" } });
    for (const template of [
      { title: "x".repeat(201) },
      { internal_notes: "x".repeat(2001) },
      { attendee: { name: "x".repeat(121) } },
    ])
      await expect(insert(template)).rejects.toMatchObject({ code: "23514" });
  });
  it("conserva las restricciones temporales, idempotencia y cancelación", async () => {
    const insert = (uid, status = "confirmed", key = uid) =>
      pool.query(
        `INSERT INTO calendar.events(calendar_id,kind,status,during,created_by,created_via,ical_uid,idempotency_key) VALUES ('0192f3c4-0000-7000-8000-00000000bbbb','appointment',$1,'[2026-10-20 10:00Z,2026-10-20 10:30Z)','0192f3c4-0000-7000-8000-00000000aaaa','public',$2,$3) RETURNING id`,
        [status, uid, key],
      );
    const first = (await insert("first")).rows[0];
    await expect(insert("overlap")).rejects.toMatchObject({ code: "23P01" });
    await pool.query(
      "UPDATE calendar.events SET status='cancelled', cancel_reason='Cambio de planes' WHERE id=$1",
      [first.id],
    );
    await insert("replacement");
    await expect(insert("duplicate-key", "cancelled", "first")).rejects.toMatchObject({ code: "23505" });
    for (const [field, limit] of [
      ["title", 200],
      ["customer_notes", 1000],
      ["internal_notes", 2000],
      ["cancel_reason", 500],
    ]) {
      // Identificadores de esta tabla cerrada; los valores siempre van parametrizados.
      await pool.query(`UPDATE calendar.events SET ${field}=$1 WHERE id=$2`, ["x".repeat(limit), first.id]);
      await expect(
        pool.query(`UPDATE calendar.events SET ${field}=$1 WHERE id=$2`, ["x".repeat(limit + 1), first.id]),
      ).rejects.toMatchObject({ code: "23514" });
    }
    await expect(
      pool.query("UPDATE calendar.events SET attendee=$1 WHERE id=$2", [
        JSON.stringify({ name: "x".repeat(121) }),
        first.id,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
