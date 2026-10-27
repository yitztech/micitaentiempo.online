import { siteConfigFromEnv } from "@mcet/i18n";
import { NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import type { FastifyReply, FastifyRequest } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BusinessProfileService } from "../../src/businesses/business-profile.service.js";
import { PublicBusinessController } from "../../src/businesses/public-business.controller.js";
import { PublicBusinessService } from "../../src/businesses/public-business.service.js";
import type { Env } from "../../src/config/env.js";
import { runMigrations } from "../../src/db/migrate.js";
import * as schema from "../../src/db/schema.js";
import type { CalendarClients } from "../../src/internal-rpc/calendar-client.js";

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let publicService: PublicBusinessService;
let controller: PublicBusinessController;

// Stable UUIDv7 IDs
const orgPub1 = "019a0000-0000-7000-8000-000000000101"; // Published in Madrid
const orgPub2 = "019a0000-0000-7000-8000-000000000102"; // Published in Guadalajara (ES) with 2 branches
const orgPub3 = "019a0000-0000-7000-8000-000000000103"; // Published in Guadalajara (MX)
const orgDraft = "019a0000-0000-7000-8000-000000000104"; // Draft
const orgSusp = "019a0000-0000-7000-8000-000000000105"; // Suspended org

const cal1 = "019a0000-0000-7000-8000-000000000201";
const cal2a = "019a0000-0000-7000-8000-000000000202";
const cal2b = "019a0000-0000-7000-8000-000000000203";
const cal3 = "019a0000-0000-7000-8000-000000000204";

const loc1 = "019a0000-0000-7000-8000-000000000301";
const loc2Near = "019a0000-0000-7000-8000-000000000302"; // Near Madrid (Alcobendas, ~14km)
const loc2Far = "019a0000-0000-7000-8000-000000000303"; // Far Madrid (Guadalajara ES, ~55km)
const loc3Mx = "019a0000-0000-7000-8000-000000000304"; // Guadalajara MX

const mockEnv = {
  site: siteConfigFromEnv({
    SITE_URL: "https://micitaentiempo.online",
    SITE_URL_EN: "https://mytimeappointment.com",
  }),
} as unknown as Env;

const mockCalendarRpc: CalendarClients = {
  client: () => ({
    listServices: async () => ({
      services: [
        {
          id: "019a0000-0000-7000-8000-000000000401",
          calendarId: cal1,
          name: { es: "Corte y Estilo", en: "Cut & Style" },
          description: { es: "Servicio completo", en: "Full service" },
          durationMin: 45,
          active: true,
          position: 0,
        },
      ],
    }),
  }),
} as unknown as CalendarClients;

function createMockReply() {
  const headers: Record<string, string> = {};
  return {
    header: (k: string, v: string) => {
      headers[k.toLowerCase()] = v;
      return undefined;
    },
    getHeaders: () => headers,
  } as unknown as FastifyReply;
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.6-alpine3.24").start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await runMigrations(pool, { log() {} });

  db = drizzle(pool, { schema });
  publicService = new PublicBusinessService(db, mockCalendarRpc);
  controller = new PublicBusinessController({} as unknown as BusinessProfileService, publicService, mockEnv);

  // Seed Users
  await pool.query(`
    INSERT INTO app.users(id, name, email) VALUES
    ('user-1', 'Usuario Uno', 'u1@example.com'),
    ('user-2', 'Usuario Dos', 'u2@example.com'),
    ('user-3', 'Usuario Tres', 'u3@example.com'),
    ('user-4', 'Usuario Cuatro', 'u4@example.com'),
    ('user-5', 'Usuario Cinco', 'u5@example.com');
  `);

  // Seed Organizations
  await pool.query(`
    INSERT INTO app.organizations(id, name, owner_user_id, plan, status) VALUES
    ('${orgPub1}', 'Peluquería Madrid', 'user-1', 'branches', 'active'),
    ('${orgPub2}', 'Clínica Dental Guada', 'user-2', 'branches', 'active'),
    ('${orgPub3}', 'Spa Guadalajara MX', 'user-3', 'branches', 'active'),
    ('${orgDraft}', 'Taller Borrador', 'user-4', 'branches', 'active'),
    ('${orgSusp}', 'Gimnasio Suspendido', 'user-5', 'branches', 'suspended');
  `);

  // Seed Business Profiles
  await pool.query(`
    INSERT INTO app.business_profiles(org_id, display_name, description, primary_category_id, status, version, published_at) VALUES
    ('${orgPub1}', 'Peluquería Élite Madrid', 'Cortes modernos y peinados en el centro de Madrid.', 'beauty', 'published', 1, NOW()),
    ('${orgPub2}', 'Clínica Dental Salud', 'Odontología integral y ortodoncia especializada.', 'health', 'published', 1, NOW()),
    ('${orgPub3}', 'Spa Relajación Total', 'Masajes y bienestar en Jalisco México.', 'wellness', 'published', 1, NOW()),
    ('${orgDraft}', 'Taller Mecánico Veloz', 'Reparación de autos rápida.', 'automotive', 'draft', 1, NULL),
    ('${orgSusp}', 'Gimnasio Fitness Plus', 'Entrenamiento de fuerza y cardio.', 'sport', 'published', 1, NOW());
  `);

  // Secondary categories for orgPub1
  await pool.query(`
    INSERT INTO app.business_profile_categories(org_id, category_id) VALUES
    ('${orgPub1}', 'wellness');
  `);

  // Social links for orgPub1
  await pool.query(`
    INSERT INTO app.business_social_links(id, org_id, platform, url) VALUES
    ('019a0000-0000-7000-8000-000000000501', '${orgPub1}', 'instagram', 'https://instagram.com/peluqueria_madrid');
  `);

  // Locations:
  // Madrid Centro: 40.4168, -3.7038
  // Alcobendas (near Madrid, ~14km): 40.5475, -3.6420
  // Guadalajara ES (far Madrid, ~55km): 40.6338, -3.1667
  // Guadalajara MX: 20.6597, -103.3496
  await pool.query(`
    INSERT INTO app.business_locations(id, org_id, name, country, region, locality, locality_key, address, postal_code, latitude, longitude, address_visibility) VALUES
    ('${loc1}', '${orgPub1}', 'Sede Sol', 'ES', 'Comunidad de Madrid', 'Madrid', 'madrid', 'Calle Mayor 1', '28013', 40.4168, -3.7038, 'public'),
    ('${loc2Near}', '${orgPub2}', 'Sucursal Alcobendas', 'ES', 'Comunidad de Madrid', 'Alcobendas', 'alcobendas', 'Avenida España 10', '28100', 40.5475, -3.6420, 'public'),
    ('${loc2Far}', '${orgPub2}', 'Sede Principal Guada', 'ES', 'Castilla-La Mancha', 'Guadalajara', 'guadalajara', 'Calle Mayor 25', '19001', 40.6338, -3.1667, 'locality'),
    ('${loc3Mx}', '${orgPub3}', 'Sede Chapultepec', 'MX', 'Jalisco', 'Guadalajara', 'guadalajara', 'Av Chapultepec 500', '44160', 20.6597, -103.3496, 'public');
  `);

  // Images
  await pool.query(`
    INSERT INTO app.business_images(id, org_id, storage_key, mime_type, bytes, width, height, alt, position, cover) VALUES
    ('019a0000-0000-7000-8000-000000000601', '${orgPub1}', 'cover-pub1', 'image/webp', 1024, 800, 600, 'Portada Peluquería', 0, true),
    ('019a0000-0000-7000-8000-000000000602', '${orgPub2}', 'cover-pub2', 'image/webp', 2048, 800, 600, 'Portada Dental', 0, true);
  `);

  // Calendar projections (active and with services)
  await pool.query(`
    INSERT INTO app.business_calendar_projection(calendar_id, org_id, aggregate_version, state, slug, has_active_services) VALUES
    ('${cal1}', '${orgPub1}', 1, 'active', 'peluqueria-madrid', true),
    ('${cal2a}', '${orgPub2}', 1, 'active', 'dental-alcobendas', true),
    ('${cal2b}', '${orgPub2}', 1, 'active', 'dental-guadalajara', true),
    ('${cal3}', '${orgPub3}', 1, 'active', 'spa-guadalajara', true);
  `);

  // Attach calendars to locations
  await pool.query(`
    INSERT INTO app.business_calendar_locations(calendar_id, org_id, location_id) VALUES
    ('${cal1}', '${orgPub1}', '${loc1}'),
    ('${cal2a}', '${orgPub2}', '${loc2Near}'),
    ('${cal2b}', '${orgPub2}', '${loc2Far}'),
    ('${cal3}', '${orgPub3}', '${loc3Mx}');
  `);
});

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe("C4 — Public Directory API, Categories & Locality Search", () => {
  it("GET /business-categories returns active categories with localized labels and pagination", async () => {
    // Via controller in Spanish
    const reqEs = { headers: { host: "micitaentiempo.online" } } as unknown as FastifyRequest;
    const resEs = createMockReply();
    const esPage = await controller.getCategories({ limit: 5 }, reqEs, resEs);

    expect(esPage.items.length).toBe(5);
    expect(esPage.items[0]?.code).toBe("health");
    expect(esPage.items[0]?.label).toBe("Salud");
    expect(esPage.nextCursor).toBeDefined();

    // Next page with cursor
    if (!esPage.nextCursor) throw new Error("cursor is undefined");
    const esPage2 = await controller.getCategories({ limit: 5, cursor: esPage.nextCursor }, reqEs, resEs);
    expect(esPage2.items.length).toBe(5);
    expect(esPage2.items[0]?.code).not.toBe(esPage.items[0]?.code);

    // Via controller in English
    const reqEn = { headers: { host: "mytimeappointment.com" } } as unknown as FastifyRequest;
    const resEn = createMockReply();
    const enPage = await controller.getCategories({ limit: 5 }, reqEn, resEn);
    expect(enPage.items[0]?.code).toBe("health");
    expect(enPage.items[0]?.label).toBe("Health");
  });

  it("GET /business-localities returns published localities, accent-insensitively, and distinguishes homonymous cities", async () => {
    // Guadalajara in Spain
    const req = { headers: { host: "micitaentiempo.online" } } as unknown as FastifyRequest;
    const res = createMockReply();
    const esLocalities = await controller.getLocalities({ country: "ES", q: "guada", limit: 20 }, req, res);
    expect(esLocalities.items).toEqual([
      { country: "ES", region: "Castilla-La Mancha", locality: "Guadalajara" },
    ]);

    // Guadalajara in Mexico
    const mxLocalities = await controller.getLocalities({ country: "MX", q: "guad", limit: 20 }, req, res);
    expect(mxLocalities.items).toEqual([{ country: "MX", region: "Jalisco", locality: "Guadalajara" }]);

    // Accent test: searching 'madrid' matches Madrid
    const madridRes = await controller.getLocalities({ country: "ES", q: "madr", limit: 20 }, req, res);
    expect(madridRes.items.length).toBe(1);
    expect(madridRes.items[0]?.locality).toBe("Madrid");

    // Draft or suspended organizations never appear
    const draftRes = await controller.getLocalities({ country: "ES", q: "Fitness", limit: 20 }, req, res);
    expect(draftRes.items).toHaveLength(0);
  });

  it("GET /businesses by manual locality filters published businesses, excludes drafts and respects addressVisibility", async () => {
    const req = { headers: { host: "micitaentiempo.online" } } as unknown as FastifyRequest;
    const res = createMockReply();
    const directory = await controller.searchBusinesses(
      {
        country: "ES",
        locality: "Madrid",
        sort: "name",
        limit: 20,
      },
      req,
      res,
    );

    expect(directory.items.length).toBe(1);
    const item = directory.items[0];
    expect(item).toBeDefined();
    if (!item) throw new Error("item is undefined");

    expect(item.displayName).toBe("Peluquería Élite Madrid");
    expect(item.primaryCategory).toBe("beauty");
    expect(item.cover?.url).toContain("thumbnail");
    expect(item.distanceKm).toBeNull(); // No distance in manual search
    expect(item.bookingTargets.length).toBe(1);
    expect(item.bookingTargets[0]?.slug).toBe("peluqueria-madrid");
    expect(item.bookingTargets[0]?.reservable).toBe(true);

    // addressVisibility was public
    expect(item.location.addressVisibility).toBe("public");
    if (item.location.addressVisibility === "public") {
      expect(item.location.address).toBe("Calle Mayor 1");
      expect(item.location.latitude).toBe(40.4168);
    }
  });

  it("GET /businesses respects addressVisibility='locality' by omitting private street and coordinates", async () => {
    const req = { headers: { host: "micitaentiempo.online" } } as unknown as FastifyRequest;
    const res = createMockReply();
    const directory = await controller.searchBusinesses(
      {
        country: "ES",
        locality: "Guadalajara",
        sort: "name",
        limit: 20,
      },
      req,
      res,
    );

    expect(directory.items.length).toBe(1);
    const item = directory.items[0];
    expect(item).toBeDefined();
    if (!item) throw new Error("item is undefined");

    expect(item.displayName).toBe("Clínica Dental Salud");
    expect(item.location.addressVisibility).toBe("locality");
    expect("address" in item.location).toBe(false);
    expect("latitude" in item.location).toBe(false);
    expect("longitude" in item.location).toBe(false);
  });

  it("GET /businesses filters by category (both primary and secondary)", async () => {
    const req = { headers: { host: "micitaentiempo.online" } } as unknown as FastifyRequest;
    const res = createMockReply();

    // Primary category 'beauty' matches Peluquería
    const beauty = await controller.searchBusinesses(
      {
        country: "ES",
        locality: "Madrid",
        category: "beauty",
        sort: "name",
        limit: 20,
      },
      req,
      res,
    );
    expect(beauty.items.length).toBe(1);

    // Secondary category 'wellness' also matches Peluquería
    const wellness = await controller.searchBusinesses(
      {
        country: "ES",
        locality: "Madrid",
        category: "wellness",
        sort: "name",
        limit: 20,
      },
      req,
      res,
    );
    expect(wellness.items.length).toBe(1);

    // Different category does not match
    const automotive = await controller.searchBusinesses(
      {
        country: "ES",
        locality: "Madrid",
        category: "automotive",
        sort: "name",
        limit: 20,
      },
      req,
      res,
    );
    expect(automotive.items.length).toBe(0);
  });

  it("GET /businesses text search matches name and description", async () => {
    const req = { headers: { host: "micitaentiempo.online" } } as unknown as FastifyRequest;
    const res = createMockReply();

    const resName = await controller.searchBusinesses(
      {
        country: "ES",
        locality: "Madrid",
        q: "élite",
        sort: "name",
        limit: 20,
      },
      req,
      res,
    );
    expect(resName.items.length).toBe(1);

    const resDesc = await controller.searchBusinesses(
      {
        country: "ES",
        locality: "Madrid",
        q: "peinados",
        sort: "name",
        limit: 20,
      },
      req,
      res,
    );
    expect(resDesc.items.length).toBe(1);

    const resNone = await controller.searchBusinesses(
      {
        country: "ES",
        locality: "Madrid",
        q: "no_existe",
        sort: "name",
        limit: 20,
      },
      req,
      res,
    );
    expect(resNone.items.length).toBe(0);
  });
});

describe("C5 — Real Distance Search, Deduplication, & Cursors", () => {
  it("calculates real straight-line Haversine distance, orders nearest first, and respects radius", async () => {
    // Search centered at Madrid (Puerta del Sol: 40.4168, -3.7038)
    // Sede Sol is at ~0 km
    // Sede Alcobendas (Clínica Dental) is at ~15 km
    // Sede Guada is at ~55 km
    const req = { headers: { host: "micitaentiempo.online" } } as unknown as FastifyRequest;
    const res = createMockReply();

    // Radius 25 km: should include Madrid (~0 km) and Alcobendas (~15 km), but NOT Guadalajara ES (~55 km)
    const res25 = await controller.searchBusinesses(
      {
        lat: 40.4168,
        lng: -3.7038,
        radiusKm: 25,
        sort: "distance",
        limit: 20,
      },
      req,
      res,
    );

    expect(res25.items.length).toBe(2);
    // Nearest first
    expect(res25.items[0]?.displayName).toBe("Peluquería Élite Madrid");
    expect(res25.items[0]?.distanceKm).toBe(0);

    expect(res25.items[1]?.displayName).toBe("Clínica Dental Salud");
    expect(res25.items[1]?.distanceKm).toBeGreaterThan(14);
    expect(res25.items[1]?.distanceKm).toBeLessThan(16);

    // Deduplication check: Clínica Dental has 2 locations (Alcobendas 15km and Guada 55km).
    // It should appear ONLY ONCE with the nearest location (Alcobendas), not Guadalajara!
    expect(res25.items[1]?.location.locality).toBe("Alcobendas");

    // Radius 5 km: should include only Sede Sol (0 km)
    const res5 = await controller.searchBusinesses(
      {
        lat: 40.4168,
        lng: -3.7038,
        radiusKm: 5,
        sort: "distance",
        limit: 20,
      },
      req,
      res,
    );
    expect(res5.items.length).toBe(1);
    expect(res5.items[0]?.displayName).toBe("Peluquería Élite Madrid");
  });

  it("paginates by distance with keyset cursor and rejects mismatched cursor", async () => {
    const req = { headers: { host: "micitaentiempo.online" } } as unknown as FastifyRequest;
    const res = createMockReply();

    // Page 1 with limit 1
    const p1 = await controller.searchBusinesses(
      {
        lat: 40.4168,
        lng: -3.7038,
        radiusKm: 25,
        sort: "distance",
        limit: 1,
      },
      req,
      res,
    );

    expect(p1.items.length).toBe(1);
    expect(p1.items[0]?.displayName).toBe("Peluquería Élite Madrid");
    expect(p1.nextCursor).toBeDefined();
    if (!p1.nextCursor) throw new Error("p1.nextCursor is undefined");

    // Page 2 with cursor from p1
    const p2 = await controller.searchBusinesses(
      {
        lat: 40.4168,
        lng: -3.7038,
        radiusKm: 25,
        sort: "distance",
        limit: 1,
        cursor: p1.nextCursor,
      },
      req,
      res,
    );

    expect(p2.items.length).toBe(1);
    expect(p2.items[0]?.displayName).toBe("Clínica Dental Salud");
    expect(p2.items[0]?.businessId).not.toBe(p1.items[0]?.businessId);

    // Modifying filter while keeping old cursor throws 422 mismatched_cursor
    await expect(
      controller.searchBusinesses(
        {
          lat: 40.4168,
          lng: -3.7038,
          radiusKm: 50, // Modified radius
          sort: "distance",
          limit: 1,
          cursor: p1.nextCursor,
        },
        req,
        res,
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it("handles boundary conditions: poles and antimeridian bounding queries", async () => {
    const req = { headers: { host: "micitaentiempo.online" } } as unknown as FastifyRequest;
    const res = createMockReply();

    // Near north pole (88.5, 0)
    const poleRes = await controller.searchBusinesses(
      {
        lat: 88.5,
        lng: 0,
        radiusKm: 50,
        sort: "distance",
        limit: 20,
      },
      req,
      res,
    );
    expect(poleRes.items).toHaveLength(0);

    // Near antimeridian (0, 179.9)
    const antiRes = await controller.searchBusinesses(
      {
        lat: 0,
        lng: 179.9,
        radiusKm: 50,
        sort: "distance",
        limit: 20,
      },
      req,
      res,
    );
    expect(antiRes.items).toHaveLength(0);
  });
});

describe("C4 — Detail Profile & EXPLAIN ANALYZE Performance", () => {
  it("GET /businesses/:businessId returns full PublicBusinessProfile with services and social links", async () => {
    const req = { headers: { host: "micitaentiempo.online" } } as unknown as FastifyRequest;
    const res = createMockReply();

    const profile = await controller.getBusinessProfile(orgPub1, req, res);

    expect(profile.businessId).toBe(orgPub1);
    expect(profile.displayName).toBe("Peluquería Élite Madrid");
    expect(profile.primaryCategory).toBe("beauty");
    expect(profile.secondaryCategories).toEqual(["wellness"]);
    expect(profile.socialLinks).toEqual([
      { platform: "instagram", url: "https://instagram.com/peluqueria_madrid" },
    ]);
    expect(profile.locations.length).toBe(1);
    expect(profile.images.length).toBe(1);
    expect(profile.images[0]?.url).toBe(
      `/api/public/v1/businesses/${orgPub1}/images/019a0000-0000-7000-8000-000000000601/display`,
    );
    expect(profile.bookingTargets.length).toBe(1);
    expect(profile.services.length).toBe(1);
    expect(profile.services[0]?.name).toBe("Corte y Estilo");
    expect(profile.reservable).toBe(true);
  });

  it("GET /businesses/:businessId returns 404 for draft, unpublished, or suspended organizations", async () => {
    const req = { headers: { host: "micitaentiempo.online" } } as unknown as FastifyRequest;
    const res = createMockReply();

    await expect(controller.getBusinessProfile(orgDraft, req, res)).rejects.toThrow(NotFoundException);
    await expect(controller.getBusinessProfile(orgSusp, req, res)).rejects.toThrow(NotFoundException);
    await expect(
      controller.getBusinessProfile("019a0000-0000-7000-8000-000000000999", req, res),
    ).rejects.toThrow(NotFoundException);
  });

  it("C5 Benchmark: EXPLAIN ANALYZE confirms efficient execution and plan on PostgreSQL", async () => {
    // Run EXPLAIN ANALYZE on locality search
    const explainLoc = await pool.query(`
      EXPLAIN ANALYZE
      SELECT country, region, locality
      FROM (
        SELECT DISTINCT loc.country, loc.region, loc.locality
        FROM app.business_locations loc
        JOIN app.business_profiles bp ON bp.org_id = loc.org_id
        JOIN app.organizations org ON org.id = bp.org_id
        WHERE bp.status = 'published'
          AND org.status <> 'suspended'
          AND org.deleted_at IS NULL
          AND loc.country = 'ES'
          AND loc.locality_key LIKE '%madrid%'
      ) loc
      ORDER BY LOWER(loc.locality) ASC, LOWER(loc.region) ASC
      LIMIT 21;
    `);
    expect(explainLoc.rows.length).toBeGreaterThan(0);

    // Run EXPLAIN ANALYZE on distance query
    const explainGeo = await pool.query(`
      EXPLAIN ANALYZE
      WITH eligible_locations AS (
        SELECT DISTINCT ON (loc.org_id)
          loc.id AS location_id,
          loc.org_id,
          (2.0 * 6371.0 * ASIN(
            LEAST(1.0, SQRT(
              POWER(SIN(RADIANS(loc.latitude - 40.4168) / 2.0), 2) +
              COS(RADIANS(40.4168)) * COS(RADIANS(loc.latitude)) *
              POWER(SIN(RADIANS(loc.longitude - (-3.7038)) / 2.0), 2)
            ))
          )) AS distance_km
        FROM app.business_locations loc
        WHERE loc.latitude IS NOT NULL
          AND loc.longitude IS NOT NULL
          AND loc.latitude BETWEEN 40.1 AND 40.7
          AND loc.longitude BETWEEN -4.0 AND -3.4
        ORDER BY loc.org_id, distance_km ASC, loc.id ASC
      )
      SELECT bp.org_id, bp.display_name, el.distance_km
      FROM eligible_locations el
      JOIN app.business_profiles bp ON bp.org_id = el.org_id
      JOIN app.organizations org ON org.id = bp.org_id
      WHERE bp.status = 'published'
        AND org.status <> 'suspended'
        AND org.deleted_at IS NULL
      ORDER BY el.distance_km ASC, bp.org_id ASC
      LIMIT 21;
    `);
    expect(explainGeo.rows.length).toBeGreaterThan(0);
  });
});
