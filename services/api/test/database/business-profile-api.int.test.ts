import type { CreateBusinessLocation, UpdateBusinessProfile } from "@mcet/schemas";
import { ConflictException, ForbiddenException, UnprocessableEntityException } from "@nestjs/common";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuditService } from "../../src/audit/audit.service.js";
import { AuthRegistry, type SessionUser } from "../../src/auth/auth.registry.js";
import { BillingService } from "../../src/billing/billing.service.js";
import { BusinessImageService } from "../../src/businesses/business-image.service.js";
import { BusinessProfileRepository } from "../../src/businesses/business-profile.repository.js";
import { BusinessProfileService } from "../../src/businesses/business-profile.service.js";
import { AppClock } from "../../src/common/clock.js";
import type { Env } from "../../src/config/env.js";
import { runMigrations } from "../../src/db/migrate.js";
import * as schema from "../../src/db/schema.js";
import type { CalendarClients } from "../../src/internal-rpc/calendar-client.js";
import { MeController } from "../../src/me/me.controller.js";
import type { NotificationsService } from "../../src/notifications/notifications.service.js";
import { OrgsService } from "../../src/orgs/orgs.service.js";

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let audit: AuditService;
let orgs: OrgsService;
let repository: BusinessProfileRepository;
let service: BusinessProfileService;
let meController: MeController;

const orgA = "019a0000-0000-7000-8000-000000000010";
const orgB = "019a0000-0000-7000-8000-000000000020";
const calA = "019a0000-0000-7000-8000-000000000030";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.6-alpine3.24").start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await runMigrations(pool, { log() {} });

  db = drizzle(pool, { schema });
  audit = new AuditService(db);
  orgs = new OrgsService(db, audit);
  repository = new BusinessProfileRepository(db);
  const imageService = new BusinessImageService({ UPLOADS_DIR: "/tmp" } as unknown as Env);
  service = new BusinessProfileService(db, repository, audit, imageService);
  meController = new MeController(db, orgs, {} as unknown as AuthRegistry, audit);

  await pool.query(
    "INSERT INTO app.users(id,name,email) VALUES ('owner-a','Ana','a@example.com'),('owner-b','Bea','b@example.com'),('customer-c','Carlos','c@example.com')",
  );
  await pool.query(
    "INSERT INTO app.organizations(id,name,owner_user_id,plan,status) VALUES ($1,'Clínica Dental','owner-a','branches','active'),($2,'Estudio Creativo','owner-b','branches','active')",
    [orgA, orgB],
  );
  await pool.query(
    "INSERT INTO app.calendar_members(calendar_id,org_id,user_id,role,added_by,notify) VALUES ($1,$2,'owner-a','owner','owner-a',true)",
    [calA, orgA],
  );
});

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe("C2 — Private Business Profile API with real PostgreSQL", () => {
  it("only owner can access business profile; non-owners and customers receive 403", async () => {
    // Owner of orgA can access
    const profile = await service.getProfile("owner-a");
    expect(profile.businessId).toBe(orgA);
    expect(profile.version).toBe(1);
    expect(profile.status).toBe("draft");
    expect(profile.content.displayName).toBe("Clínica Dental");

    // Non-owner / stranger gets 403
    await expect(service.getProfile("customer-c")).rejects.toThrow(ForbiddenException);

    // Another owner cannot manage orgA (owner-b gets their own orgB, never orgA)
    const profileB = await service.getProfile("owner-b");
    expect(profileB.businessId).toBe(orgB);
    expect(profileB.businessId).not.toBe(orgA);
  });

  it("calculates initial missing publication requirements correctly", async () => {
    const profile = await service.getProfile("owner-a");
    // Initial draft has displayName ("Clínica Dental"), but lacks description, primary_category, location, active_calendar, active_service
    expect(profile.requirements).toContain("description");
    expect(profile.requirements).toContain("primary_category");
    expect(profile.requirements).toContain("location");
    expect(profile.requirements).toContain("active_calendar");
    expect(profile.requirements).toContain("active_service");
  });

  it("rejects publication with 422 publication_requirements_not_met if requirements are missing", async () => {
    const idempotencyKey = "019a0000-0000-7000-8000-000000000099";
    await expect(service.publish("owner-a", idempotencyKey, { expectedVersion: 1 })).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it("updates business profile, enforces optimistic locking (409 on version mismatch), and handles idempotency", async () => {
    const keyUpdate1 = "019a0000-0000-7000-8000-000000000101";

    // 1. Mismatch expectedVersion throws 409
    await expect(
      service.updateProfile("owner-a", keyUpdate1, {
        expectedVersion: 999,
        displayName: "Clínica Dental Avanzada",
        description: "Servicios odontológicos completos de alta calidad para toda la familia.",
        primaryCategory: "health",
        secondaryCategories: ["wellness"],
        websiteUrl: "https://clinicadental.example.com",
        termsUrl: "https://clinicadental.example.com/terminos",
        socialLinks: [{ platform: "instagram", url: "https://instagram.com/clinicadental" }],
      }),
    ).rejects.toThrow(ConflictException);

    // 2. Successful update with expectedVersion = 1
    const updateBody: UpdateBusinessProfile = {
      expectedVersion: 1,
      displayName: "Clínica Dental Avanzada",
      description: "Servicios odontológicos completos de alta calidad para toda la familia.",
      primaryCategory: "health",
      secondaryCategories: ["wellness"],
      websiteUrl: "https://clinicadental.example.com",
      termsUrl: "https://clinicadental.example.com/terminos",
      socialLinks: [{ platform: "instagram", url: "https://instagram.com/clinicadental" }],
    };

    const updated = await service.updateProfile("owner-a", keyUpdate1, updateBody);
    expect(updated.version).toBe(2);
    expect(updated.content.displayName).toBe("Clínica Dental Avanzada");
    expect(updated.content.primaryCategory).toBe("health");
    expect(updated.content.secondaryCategories).toEqual(["wellness"]);
    expect(updated.content.socialLinks).toEqual([
      { platform: "instagram", url: "https://instagram.com/clinicadental" },
    ]);

    // 3. Idempotent retry with same key and same payload returns version 2 without failing or re-incrementing
    const replayed = await service.updateProfile("owner-a", keyUpdate1, updateBody);
    expect(replayed.version).toBe(2);
    expect(replayed.content.displayName).toBe("Clínica Dental Avanzada");

    // 4. Retry with same key but DIFFERENT payload throws 409 idempotency_mismatch
    await expect(
      service.updateProfile("owner-a", keyUpdate1, {
        ...updateBody,
        displayName: "Nombre Distinto",
      }),
    ).rejects.toThrow(ConflictException);

    // 5. Verify audit log was recorded without copying private texts
    const [auditEntry] = (
      await pool.query(
        "SELECT * FROM app.audit_log WHERE org_id = $1 AND action = 'profile.updated' ORDER BY created_at DESC LIMIT 1",
        [orgA],
      )
    ).rows;
    expect(auditEntry).toBeDefined();
    expect(auditEntry.metadata).toEqual({ version: 2 });
    expect(auditEntry.metadata).not.toHaveProperty("description");
  });

  it("manages locations: creates, paginates, updates, enforces max 10 quota, and deletes", async () => {
    // Current profile version is 2
    const keyLoc1 = "019a0000-0000-7000-8000-000000000201";
    const loc1Data: CreateBusinessLocation = {
      expectedVersion: 2,
      location: {
        name: "Sede Centro",
        country: "MX",
        region: "Morelos",
        locality: "Cuernavaca",
        address: "Av. Morelos 123",
        postalCode: "62000",
        addressVisibility: "public",
        latitude: 18.9261,
        longitude: -99.2307,
      },
    };

    const loc1 = await service.createLocation("owner-a", keyLoc1, loc1Data);
    expect(loc1.id).toBeDefined();
    expect(loc1.version).toBe(3); // Increments parent profile version
    expect(loc1.location.name).toBe("Sede Centro");

    // Idempotent retry of createLocation
    const loc1Replayed = await service.createLocation("owner-a", keyLoc1, loc1Data);
    expect(loc1Replayed.id).toBe(loc1.id);
    expect(loc1Replayed.version).toBe(3);

    // Get locations page
    const page = await service.getLocations("owner-a");
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe(loc1.id);
    expect(page.items[0]?.location.locality).toBe("Cuernavaca");

    // Update location
    const keyUpdateLoc = "019a0000-0000-7000-8000-000000000202";
    const updatedLoc = await service.updateLocation("owner-a", loc1.id, keyUpdateLoc, {
      expectedVersion: 3,
      location: {
        ...loc1Data.location,
        name: "Sede Centro Histórico",
      },
    });
    expect(updatedLoc.location.name).toBe("Sede Centro Histórico");
    expect(updatedLoc.version).toBe(4);

    // Create 9 more locations to test the 10-location quota
    let currentVersion = 4;
    for (let i = 2; i <= 10; i++) {
      const key = `019a0000-0000-7000-8000-${i.toString(16).padStart(12, "0")}`;
      await service.createLocation("owner-a", key, {
        expectedVersion: currentVersion,
        location: {
          name: `Sucursal ${i}`,
          country: "MX",
          region: "Morelos",
          locality: "Cuernavaca",
          address: `Calle ${i}`,
          postalCode: "62000",
          addressVisibility: "locality",
          latitude: null,
          longitude: null,
        },
      });
      currentVersion++;
    }

    // 11th location must be rejected with 422 max_locations_exceeded
    const keyOverQuota = "019a0000-0000-7000-8000-000000000299";
    await expect(
      service.createLocation("owner-a", keyOverQuota, {
        expectedVersion: currentVersion,
        location: {
          name: "Sucursal Extra",
          country: "MX",
          region: "Morelos",
          locality: "Cuernavaca",
          address: "Calle 11",
          postalCode: "62000",
          addressVisibility: "locality",
          latitude: null,
          longitude: null,
        },
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it("handles calendar-location assignment, detaches, and prevents deleting location in use", async () => {
    const [profile] = await db
      .select()
      .from(schema.businessProfiles)
      .where(eq(schema.businessProfiles.orgId, orgA));
    let version = profile?.version ?? 1;

    // Get the first location
    const locations = await service.getLocations("owner-a");
    const targetLoc = locations.items[0];
    expect(targetLoc).toBeDefined();
    if (!targetLoc) throw new Error("targetLoc missing");

    // Ensure projection has an active calendar for calA
    await repository.applyCalendarSnapshot({
      eventId: calA,
      schemaVersion: 1,
      aggregateVersion: 1,
      occurredAt: new Date().toISOString(),
      businessId: orgA,
      calendarId: calA,
      state: "active",
      slug: "clinica-cal",
      hasActiveServices: true,
    });

    // Assign calA to targetLoc
    const keyAssign = "019a0000-0000-7000-8000-000000000301";
    const profileAfterAssign = await service.assignCalendarLocation("owner-a", calA, keyAssign, {
      expectedVersion: version,
      locationId: targetLoc.id,
    });
    version = profileAfterAssign.version;

    // Attempting to delete targetLoc must fail with 409 location_in_use
    const keyDelLoc = "019a0000-0000-7000-8000-000000000302";
    await expect(
      service.deleteLocation("owner-a", targetLoc.id, keyDelLoc, { expectedVersion: version }),
    ).rejects.toThrow(ConflictException);

    // Detach calendar by setting locationId: null
    const keyDetach = "019a0000-0000-7000-8000-000000000303";
    const profileAfterDetach = await service.assignCalendarLocation("owner-a", calA, keyDetach, {
      expectedVersion: version,
      locationId: null,
    });
    version = profileAfterDetach.version;

    // Now delete targetLoc succeeds
    await service.deleteLocation("owner-a", targetLoc.id, keyDelLoc, { expectedVersion: version });
    const locationsAfter = await service.getLocations("owner-a");
    expect(locationsAfter.items.find((l) => l.id === targetLoc.id)).toBeUndefined();
  });

  it("publishes profile when all requirements are met and unpublishes", async () => {
    // Current profile has displayName, description, primaryCategory, locations (9 remaining), active calendar with active services
    const [profile] = await db
      .select()
      .from(schema.businessProfiles)
      .where(eq(schema.businessProfiles.orgId, orgA));
    const version = profile?.version ?? 1;

    // Check requirements: should now be empty (all 6 satisfied!)
    const currentProfile = await service.getProfile("owner-a");
    expect(currentProfile.requirements).toEqual([]);

    // Publish
    const keyPub = "019a0000-0000-7000-8000-000000000401";
    const published = await service.publish("owner-a", keyPub, { expectedVersion: version });
    expect(published.status).toBe("published");
    expect(published.version).toBe(version + 1);

    // Replay publish idempotently
    const publishedReplayed = await service.publish("owner-a", keyPub, { expectedVersion: version });
    expect(publishedReplayed.status).toBe("published");
    expect(publishedReplayed.version).toBe(version + 1);

    // Unpublish
    const keyUnpub = "019a0000-0000-7000-8000-000000000402";
    const unpublished = await service.unpublish("owner-a", keyUnpub, { expectedVersion: version + 1 });
    expect(unpublished.status).toBe("unpublished");
    expect(unpublished.version).toBe(version + 2);
  });

  it("returns capabilities in GET /api/v1/me and includes businessProfile in export", async () => {
    // 1. Owner of active business
    const meOwner = await meController.me({ id: "owner-a" } as unknown as SessionUser);
    expect(meOwner.capabilities).toEqual({
      canCreateBusiness: false,
      canManageBusinessProfile: true,
      canBook: true,
      businessId: orgA,
    });

    // 2. Normal customer without org
    const meCustomer = await meController.me({ id: "customer-c" } as unknown as SessionUser);
    expect(meCustomer.capabilities).toEqual({
      canCreateBusiness: true,
      canManageBusinessProfile: false,
      canBook: true,
      businessId: null,
    });

    // 3. Export for owner includes businessProfile
    const exportOwner = await meController.export({ id: "owner-a" } as unknown as SessionUser);
    expect(exportOwner.businessProfile).toBeDefined();
    expect(exportOwner.businessProfile?.orgId).toBe(orgA);
    expect(exportOwner.businessProfile?.categories).toBeDefined();
    expect(exportOwner.businessProfile?.locations).toBeDefined();

    // 4. Export for customer has null businessProfile
    const exportCustomer = await meController.export({ id: "customer-c" } as unknown as SessionUser);
    expect(exportCustomer.businessProfile).toBeNull();
  });

  it("BillingService.closeOrg unpublishes business profile and purges projection/locations", async () => {
    // Setup mock RPC for purgeOrg
    const mockRpc = {
      client: () => ({
        purgeOrg: async () => ({}),
      }),
    } as unknown as CalendarClients;

    const billingService = new BillingService(
      db,
      {} as unknown as Env,
      mockRpc,
      new AppClock(),
      {} as unknown as NotificationsService,
      audit,
    );

    // Close orgB
    await billingService.closeOrg("owner-b", "Estudio Creativo");

    // Profile must be marked 'unpublished'
    const [profileB] = await db
      .select()
      .from(schema.businessProfiles)
      .where(eq(schema.businessProfiles.orgId, orgB));
    expect(profileB?.status).toBe("unpublished");

    // Projections and calendar locations for orgB are cleaned up
    const projs = await db
      .select()
      .from(schema.businessCalendarProjection)
      .where(eq(schema.businessCalendarProjection.orgId, orgB));
    expect(projs).toHaveLength(0);

    // Owner-b now gets 403 on profile access (org closed/suspended)
    await expect(service.getProfile("owner-b")).rejects.toThrow(ForbiddenException);
  });
});
