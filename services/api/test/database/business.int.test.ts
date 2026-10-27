import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DescService } from "@bufbuild/protobuf";
import type { Client } from "@connectrpc/connect";
import { BUSINESS_LIMITS, BusinessCategory } from "@mcet/schemas";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuditService } from "../../src/audit/audit.service.js";
import { BusinessBackfill } from "../../src/businesses/business-backfill.service.js";
import { BusinessProfileRepository } from "../../src/businesses/business-profile.repository.js";
import { CalendarAccess } from "../../src/calendars/access.service.js";
import { CalendarsService } from "../../src/calendars/calendars.service.js";
import { runMigrations } from "../../src/db/migrate.js";
import * as schema from "../../src/db/schema.js";
import type { CalendarClients } from "../../src/internal-rpc/calendar-client.js";
import { OrgsService } from "../../src/orgs/orgs.service.js";

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let repository: BusinessProfileRepository;
const orgA = "019a0000-0000-7000-8000-000000000001";
const orgB = "019a0000-0000-7000-8000-000000000002";
const calendar = "019a0000-0000-7000-8000-000000000003";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.6-alpine3.24").start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  // Apply the previous release first, insert legacy data, then migrate to the new schema.
  const directory = fileURLToPath(new URL("../../drizzle/", import.meta.url));
  const previous = await mkdtemp(join(tmpdir(), "mcet-business-migration-"));
  try {
    await mkdir(join(previous, "meta"));
    const journal = JSON.parse(await readFile(join(directory, "meta/_journal.json"), "utf8"));
    journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 8);
    await writeFile(join(previous, "meta/_journal.json"), JSON.stringify(journal));
    for (const entry of journal.entries)
      await writeFile(
        join(previous, `${entry.tag}.sql`),
        await readFile(join(directory, `${entry.tag}.sql`)),
      );
    await migrate(drizzle(pool), { migrationsFolder: previous, migrationsSchema: "app" });
    await pool.query(
      "INSERT INTO app.users(id,name,email) VALUES ('owner-a','Ana','a@example.com'),('owner-b','Bea','b@example.com')",
    );
    await pool.query(
      "INSERT INTO app.organizations(id,name,owner_user_id,plan) VALUES ($1,'Clínica 24','owner-a','branches'),($2,'Estudio Bea','owner-b','branches')",
      [orgA, orgB],
    );
    await pool.query(
      "INSERT INTO app.calendar_members(calendar_id,org_id,user_id,role,added_by,notify) VALUES ($1,$2,'owner-a','owner','owner-a',true)",
      [calendar, orgA],
    );
    await runMigrations(pool, { log() {} });
    await runMigrations(pool, { log() {} });
  } finally {
    await rm(previous, { recursive: true, force: true });
  }
  repository = new BusinessProfileRepository(drizzle(pool, { schema }));
});
afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe("business persistence with real PostgreSQL", () => {
  it("upgrades legacy data and backfills drafts idempotently without inventing publication", async () => {
    expect(await repository.backfillPage(null)).toEqual({ processed: 1, nextCursor: null });
    await repository.backfillPage(null);
    const profile = await repository.findByOwner("owner-a");
    expect(profile).toMatchObject({
      orgId: orgA,
      status: "draft",
      version: 1,
      displayName: "Clínica 24",
      primaryCategoryId: null,
    });
    expect(await repository.findByOwner("owner-b")).toBeUndefined();
    expect(await repository.findByOwner("stranger")).toBeUndefined();
    expect((await pool.query("SELECT count(*) FROM app.business_profiles")).rows[0].count).toBe("1");
    expect(
      (await pool.query("SELECT code FROM app.business_categories ORDER BY position")).rows.map(
        (r) => r.code,
      ),
    ).toEqual(BusinessCategory.options);
  });
  it("checkpoints recurring backfill without duplication on a second run", async () => {
    const worker = new BusinessBackfill(drizzle(pool, { schema }), repository);
    await Promise.all([worker.sweep(), worker.sweep()]);
    await worker.sweep();
    expect(
      (await pool.query("SELECT value FROM app.system_info WHERE key='business_profiles_backfill_cursor'"))
        .rows[0].value,
    ).toBe("");
    expect(
      (await pool.query("SELECT count(*) FROM app.business_profiles WHERE org_id=$1", [orgA])).rows[0].count,
    ).toBe("1");
  });
  it("concurrent draft repair is idempotent and owner lookup is isolated", async () => {
    const profiles = await Promise.all([
      repository.ensureOwnerDraft("owner-b"),
      repository.ensureOwnerDraft("owner-b"),
    ]);
    expect(profiles[0]?.orgId).toBe(orgB);
    expect(profiles[1]?.orgId).toBe(orgB);
    expect(await repository.ensureOwnerDraft("stranger")).toBeUndefined();
    expect(
      (await pool.query("SELECT count(*) FROM app.business_profiles WHERE org_id=$1", [orgB])).rows[0].count,
    ).toBe("1");
  });
  it("matches shared Unicode limits to actual PostgreSQL varchar columns", async () => {
    const checks = [
      ["business_profiles", "display_name", BUSINESS_LIMITS.displayName],
      ["business_profiles", "description", BUSINESS_LIMITS.description],
      ["business_profiles", "website_url", BUSINESS_LIMITS.url],
      ["business_locations", "name", BUSINESS_LIMITS.locationName],
      ["business_locations", "locality", BUSINESS_LIMITS.locality],
      ["business_locations", "region", BUSINESS_LIMITS.region],
      ["business_locations", "address", BUSINESS_LIMITS.address],
      ["business_locations", "postal_code", BUSINESS_LIMITS.postalCode],
      ["business_images", "alt", BUSINESS_LIMITS.alt],
    ] as const;
    for (const [table, column, limit] of checks) {
      const result = await pool.query(
        "SELECT character_maximum_length FROM information_schema.columns WHERE table_schema='app' AND table_name=$1 AND column_name=$2",
        [table, column],
      );
      expect(result.rows[0]?.character_maximum_length).toBe(limit);
    }
    await pool.query("UPDATE app.business_profiles SET display_name=$1 WHERE org_id=$2", [
      "𐐀".repeat(120),
      orgA,
    ]);
    await expect(
      pool.query("UPDATE app.business_profiles SET display_name=$1 WHERE org_id=$2", ["𐐀".repeat(121), orgA]),
    ).rejects.toMatchObject({ code: "22001" });
    await expect(
      pool.query("UPDATE app.business_profiles SET display_name=$1 WHERE org_id=$2", ["bad\nname", orgA]),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("rejects incomplete publication and duplicate primary categories", async () => {
    await expect(
      pool.query("UPDATE app.business_profiles SET status='published' WHERE org_id=$1", [orgA]),
    ).rejects.toMatchObject({ code: "23514" });
    await pool.query("INSERT INTO app.business_profile_categories(org_id,category_id) VALUES ($1,'health')", [
      orgA,
    ]);
    await expect(
      pool.query("UPDATE app.business_profiles SET primary_category_id='health' WHERE org_id=$1", [orgA]),
    ).rejects.toMatchObject({ code: "23514" });
    await pool.query("DELETE FROM app.business_profile_categories WHERE org_id=$1", [orgA]);
  });
  it("retains projection tombstones and ignores repeated or older events", async () => {
    const event = {
      eventId: calendar,
      schemaVersion: 1,
      aggregateVersion: 2,
      occurredAt: "2026-10-27T12:00:00Z",
      businessId: orgA,
      calendarId: calendar,
      state: "active",
      slug: "clinica",
      hasActiveServices: true,
    };
    expect(await repository.applyCalendarSnapshot(event)).toBe(true);
    expect(await repository.applyCalendarSnapshot(event)).toBe(false);
    expect(
      await repository.applyCalendarSnapshot({
        ...event,
        aggregateVersion: 3,
        state: "deleted",
        hasActiveServices: false,
      }),
    ).toBe(true);
    expect(await repository.applyCalendarSnapshot(event)).toBe(false);
    expect(await repository.applyCalendarSnapshot({ ...event, businessId: orgB, aggregateVersion: 4 })).toBe(
      false,
    );
    expect(
      (
        await pool.query("SELECT state, org_id FROM app.business_calendar_projection WHERE calendar_id=$1", [
          calendar,
        ])
      ).rows[0],
    ).toEqual({ state: "deleted", org_id: orgA });
  });
  it("enforces tenant-safe calendar/location association with composite foreign keys", async () => {
    const result = await pool.query(
      "INSERT INTO app.business_locations(org_id,name,country,locality,locality_key) VALUES ($1,'Centro','MX','Cuernavaca','cuernavaca') RETURNING id",
      [orgB],
    );
    await expect(
      pool.query(
        "INSERT INTO app.business_calendar_locations(calendar_id,org_id,location_id) VALUES ($1,$2,$3)",
        [calendar, orgA, result.rows[0].id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });
  it("serializes quota checks under concurrent inserts, without exceeding ten locations", async () => {
    const insert = () =>
      pool.query(
        "INSERT INTO app.business_locations(org_id,name,country,locality,locality_key) VALUES ($1,'Centro','MX','Cuernavaca','cuernavaca')",
        [orgA],
      );
    const results = await Promise.allSettled(Array.from({ length: 12 }, insert));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(2);
    expect(
      (await pool.query("SELECT count(*) FROM app.business_locations WHERE org_id=$1", [orgA])).rows[0].count,
    ).toBe("10");
  });
  it("enforces the total media byte quota as well as the image count", async () => {
    const insert = (key: string) =>
      pool.query(
        "INSERT INTO app.business_images(org_id,storage_key,mime_type,bytes,width,height,alt) VALUES ($1,$2,'image/webp',$3,100,100,'Fachada')",
        [orgA, key, BUSINESS_LIMITS.imageBytes],
      );
    for (let i = 0; i < 8; i++) await insert(`media_${i}`);
    await expect(insert("media_over_quota")).rejects.toMatchObject({ code: "23514" });
    expect(
      (await pool.query("SELECT sum(bytes) AS bytes FROM app.business_images WHERE org_id=$1", [orgA]))
        .rows[0].bytes,
    ).toBe(String(BUSINESS_LIMITS.storedMediaBytes));
  });
  it("rejects invalid coordinates and prevents changing ownership directly", async () => {
    await expect(
      pool.query("UPDATE app.business_locations SET latitude=1 WHERE org_id=$1", [orgB]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query("UPDATE app.business_locations SET latitude='NaN',longitude=0 WHERE org_id=$1", [orgB]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query("UPDATE app.business_locations SET org_id=$1 WHERE org_id=$2", [orgA, orgB]),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("does not resurrect profiles of deleted organizations and cascades physical deletion", async () => {
    await pool.query("UPDATE app.organizations SET deleted_at=now() WHERE id=$1", [orgB]);
    expect(await repository.findByOwner("owner-b")).toBeUndefined();
    expect(await repository.ensureOwnerDraft("owner-b")).toBeUndefined();
    await pool.query("DELETE FROM app.organizations WHERE id=$1", [orgB]);
    expect(
      (await pool.query("SELECT count(*) FROM app.business_profiles WHERE org_id=$1", [orgB])).rows[0].count,
    ).toBe("0");
    expect(
      (await pool.query("SELECT count(*) FROM app.business_locations WHERE org_id=$1", [orgB])).rows[0].count,
    ).toBe("0");
  });

  it("reconciles RPC snapshots, recovers owner membership, and handles temporary RPC outage safely", async () => {
    const db = drizzle(pool, { schema });
    const snapCalId = "019a0000-0000-7000-8000-000000000021";
    let rpcThrows = false;

    const mockCalendarClients: CalendarClients = {
      client: <T extends DescService>(_service: T) =>
        ({
          listCalendarSnapshots: async () => {
            if (rpcThrows) throw new Error("RPC unavailable");
            return {
              snapshots: [
                {
                  calendarId: snapCalId,
                  orgId: orgA,
                  aggregateVersion: 5,
                  state: "active",
                  slug: "clinica-rec",
                  hasActiveServices: true,
                  updatedAt: undefined,
                },
              ],
              nextCursor: "",
            };
          },
        }) as unknown as Client<T>,
    };

    const worker = new BusinessBackfill(db, repository, mockCalendarClients);

    // 1. Reconcile succeeds and applies projection + recovers owner membership
    await worker.reconcileOrg(orgA, "owner-a");

    const [proj] = (
      await pool.query("SELECT * FROM app.business_calendar_projection WHERE calendar_id=$1", [snapCalId])
    ).rows;
    expect(proj).toMatchObject({
      calendar_id: snapCalId,
      org_id: orgA,
      aggregate_version: 5,
      state: "active",
      slug: "clinica-rec",
      has_active_services: true,
    });

    const [member] = (
      await pool.query(
        "SELECT * FROM app.calendar_members WHERE calendar_id=$1 AND user_id='owner-a' AND role='owner'",
        [snapCalId],
      )
    ).rows;
    expect(member).toBeDefined();

    // 2. Outage: RPC throws error; local projection and members are preserved, not deleted
    rpcThrows = true;
    await expect(worker.reconcileOrg(orgA, "owner-a")).resolves.not.toThrow();

    const [projAfterOutage] = (
      await pool.query("SELECT * FROM app.business_calendar_projection WHERE calendar_id=$1", [snapCalId])
    ).rows;
    expect(projAfterOutage).toBeDefined();
  });

  it("recovers an orphaned calendar on create without creating duplicates or hitting plan limit", async () => {
    const db = drizzle(pool, { schema });
    const audit = new AuditService(db);
    const orgs = new OrgsService(db, audit);
    const access = new CalendarAccess(db);

    const orphanedCalId = "019a0000-0000-7000-8000-000000000031";
    let createCalendarCalled = false;

    const mockCalendarClients: CalendarClients = {
      client: <T extends DescService>(_service: T) =>
        ({
          listCalendars: async () => ({
            calendars: [
              {
                id: orphanedCalId,
                slug: "consulta-express",
                name: "Consulta Express",
                timezone: "America/Mexico_City",
                capacity: 1,
                country: "MX",
                subdivision: "",
                address: "",
                embedPolicy: { mode: "any", origins: [] },
                bookingPolicy: { cancelMinNoticeMinutes: 0, contactMode: "email" },
                status: "active",
                orgStatus: "active",
              },
            ],
          }),
          createCalendar: async () => {
            createCalendarCalled = true;
            throw new Error("createCalendar should not be called when recovering orphaned calendar");
          },
        }) as unknown as Client<T>,
    };

    const calendarsService = new CalendarsService(mockCalendarClients, db, orgs, access, audit);

    const user = {
      id: "owner-a",
      email: "a@example.com",
      name: "Ana",
      locale: "es" as const,
      timezone: "America/Mexico_City",
      roles: [],
      calendarIds: [],
      emailVerified: true,
    };

    // User attempts to create calendar with same name
    const result = await calendarsService.create(user, {
      name: "Consulta Express",
      timezone: "America/Mexico_City",
      capacity: 1,
    });

    expect(createCalendarCalled).toBe(false);
    expect(result.id).toBe(orphanedCalId);
    expect(result.role).toBe("owner");

    // Local membership exists now
    const [member] = (
      await pool.query(
        "SELECT * FROM app.calendar_members WHERE calendar_id=$1 AND user_id='owner-a' AND role='owner'",
        [orphanedCalId],
      )
    ).rows;
    expect(member).toBeDefined();
  });
});
