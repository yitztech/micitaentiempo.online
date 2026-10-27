import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import {
  type AssignBusinessCalendar,
  BUSINESS_LIMITS,
  type ChangeBusinessPublication,
  type CreateBusinessLocation,
  type LocationPage,
  type PrivateBusinessProfile,
  type PrivateLocation,
  type UpdateBusinessImages,
  type UpdateBusinessProfile,
} from "@mcet/schemas";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { AuditService } from "../audit/audit.service.js";
import { uuidv7 } from "../auth/ids.js";
import { type Database, DB } from "../db/db.module.js";
import {
  businessCalendarLocations,
  businessCalendarProjection,
  businessImages,
  businessLocations,
  businessProfileCategories,
  businessProfiles,
  businessSocialLinks,
  calendarMembers,
  offlineOperations,
  organizations,
} from "../db/schema.js";
import { BusinessImageService } from "./business-image.service.js";
import { BusinessProfileRepository } from "./business-profile.repository.js";

export function normalizeLocalityKey(locality: string): string {
  return locality
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

@Injectable()
export class BusinessProfileService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly repository: BusinessProfileRepository,
    private readonly audit: AuditService,
    private readonly imageService: BusinessImageService,
  ) {}

  async getOwnerOrg(userId: string, tx?: Database) {
    const runner = tx ?? this.db;
    const [org] = await runner
      .select()
      .from(organizations)
      .where(and(eq(organizations.ownerUserId, userId), isNull(organizations.deletedAt)));
    if (!org || org.status === "suspended") {
      throw new ForbiddenException({
        code: "permission_denied",
        message: "No tienes permiso para administrar este perfil",
      });
    }
    return org;
  }

  private async executeIdempotent<T>(
    operationId: string,
    actorUserId: string,
    orgId: string,
    action: string,
    payload: unknown,
    execute: (tx: Database) => Promise<{ status: number; body: T }>,
  ): Promise<{ status: number; body: T }> {
    const requestHash = createHash("sha256")
      .update(JSON.stringify(payload ?? {}))
      .digest("hex");
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(offlineOperations)
        .where(eq(offlineOperations.operationId, operationId));
      if (existing) {
        if (existing.actorUserId !== actorUserId) {
          throw new ForbiddenException({
            code: "permission_denied",
            message: "Clave de idempotencia ajena",
          });
        }
        if (existing.requestHash !== requestHash) {
          throw new ConflictException({
            code: "idempotency_mismatch",
            message: "La clave de idempotencia ya fue utilizada con datos diferentes.",
          });
        }
        return {
          status: existing.responseStatus,
          body: existing.responseBody as T,
        };
      }

      const result = await execute(tx);
      await tx.insert(offlineOperations).values({
        operationId,
        orgId,
        actorUserId,
        action,
        requestHash,
        responseStatus: result.status,
        responseBody: (result.body ?? null) as unknown as Record<string, unknown>,
      });
      return result;
    });
  }

  async getProfile(userId: string): Promise<PrivateBusinessProfile> {
    const org = await this.getOwnerOrg(userId);
    await this.repository.ensureOwnerDraft(userId);

    const [profile] = await this.db.select().from(businessProfiles).where(eq(businessProfiles.orgId, org.id));
    if (!profile) {
      throw new NotFoundException({ code: "profile_not_found", message: "Perfil no encontrado" });
    }

    return this.assemblePrivateProfile(profile, org.id, this.db);
  }

  async updateProfile(
    userId: string,
    idempotencyKey: string,
    body: UpdateBusinessProfile,
    reqIp?: string,
  ): Promise<PrivateBusinessProfile> {
    const org = await this.getOwnerOrg(userId);

    const result = await this.executeIdempotent<PrivateBusinessProfile>(
      idempotencyKey,
      userId,
      org.id,
      "business_profile.update",
      body,
      async (tx) => {
        const [profile] = await tx
          .select()
          .from(businessProfiles)
          .where(eq(businessProfiles.orgId, org.id))
          .for("update");
        if (!profile) {
          throw new NotFoundException({ code: "profile_not_found", message: "Perfil no encontrado" });
        }

        if (profile.version !== body.expectedVersion) {
          throw new ConflictException({
            code: "profile_conflict",
            message: "El perfil cambió en otro dispositivo. Recarga para ver la versión actual.",
          });
        }

        const nextVersion = profile.version + 1;
        const now = new Date();

        await tx
          .update(businessProfiles)
          .set({
            displayName: body.displayName,
            description: body.description,
            primaryCategoryId: body.primaryCategory,
            websiteUrl: body.websiteUrl,
            termsUrl: body.termsUrl,
            version: nextVersion,
            updatedAt: now,
          })
          .where(eq(businessProfiles.orgId, org.id));

        await tx.delete(businessProfileCategories).where(eq(businessProfileCategories.orgId, org.id));
        if (body.secondaryCategories.length > 0) {
          await tx.insert(businessProfileCategories).values(
            body.secondaryCategories.map((c) => ({
              orgId: org.id,
              categoryId: c,
            })),
          );
        }

        await tx.delete(businessSocialLinks).where(eq(businessSocialLinks.orgId, org.id));
        if (body.socialLinks.length > 0) {
          await tx.insert(businessSocialLinks).values(
            body.socialLinks.map((s) => ({
              orgId: org.id,
              platform: s.platform,
              url: s.url,
            })),
          );
        }

        await this.audit.record({
          orgId: org.id,
          actorUserId: userId,
          via: "panel",
          action: "profile.updated",
          target: org.id,
          metadata: { version: nextVersion },
          ip: reqIp,
        });

        const [updated] = await tx.select().from(businessProfiles).where(eq(businessProfiles.orgId, org.id));
        if (!updated) {
          throw new NotFoundException({ code: "profile_not_found", message: "Perfil no encontrado" });
        }
        const assembled = await this.assemblePrivateProfile(updated, org.id, tx);
        return { status: 200, body: assembled };
      },
    );

    return result.body;
  }

  async publish(
    userId: string,
    idempotencyKey: string,
    body: ChangeBusinessPublication,
    reqIp?: string,
  ): Promise<PrivateBusinessProfile> {
    const org = await this.getOwnerOrg(userId);

    const result = await this.executeIdempotent<PrivateBusinessProfile>(
      idempotencyKey,
      userId,
      org.id,
      "business_profile.publish",
      body,
      async (tx) => {
        const [profile] = await tx
          .select()
          .from(businessProfiles)
          .where(eq(businessProfiles.orgId, org.id))
          .for("update");
        if (!profile) {
          throw new NotFoundException({ code: "profile_not_found", message: "Perfil no encontrado" });
        }

        if (profile.version !== body.expectedVersion) {
          throw new ConflictException({
            code: "profile_conflict",
            message: "El perfil cambió en otro dispositivo. Recarga para ver la versión actual.",
          });
        }

        const requirements = await this.checkMissingRequirements(profile, org.id, tx);
        if (requirements.length > 0) {
          throw new UnprocessableEntityException({
            code: "publication_requirements_not_met",
            message: "Completa todos los requisitos antes de publicar el perfil.",
          });
        }

        const nextVersion = profile.version + 1;
        const now = new Date();

        await tx
          .update(businessProfiles)
          .set({
            status: "published",
            publishedAt: profile.publishedAt ?? now,
            version: nextVersion,
            updatedAt: now,
          })
          .where(eq(businessProfiles.orgId, org.id));

        await this.audit.record({
          orgId: org.id,
          actorUserId: userId,
          via: "panel",
          action: "profile.published",
          target: org.id,
          metadata: { version: nextVersion },
          ip: reqIp,
        });

        const [updated] = await tx.select().from(businessProfiles).where(eq(businessProfiles.orgId, org.id));
        if (!updated) {
          throw new NotFoundException({ code: "profile_not_found", message: "Perfil no encontrado" });
        }
        const assembled = await this.assemblePrivateProfile(updated, org.id, tx);
        return { status: 200, body: assembled };
      },
    );

    return result.body;
  }

  async unpublish(
    userId: string,
    idempotencyKey: string,
    body: ChangeBusinessPublication,
    reqIp?: string,
  ): Promise<PrivateBusinessProfile> {
    const org = await this.getOwnerOrg(userId);

    const result = await this.executeIdempotent<PrivateBusinessProfile>(
      idempotencyKey,
      userId,
      org.id,
      "business_profile.unpublish",
      body,
      async (tx) => {
        const [profile] = await tx
          .select()
          .from(businessProfiles)
          .where(eq(businessProfiles.orgId, org.id))
          .for("update");
        if (!profile) {
          throw new NotFoundException({ code: "profile_not_found", message: "Perfil no encontrado" });
        }

        if (profile.version !== body.expectedVersion) {
          throw new ConflictException({
            code: "profile_conflict",
            message: "El perfil cambió en otro dispositivo. Recarga para ver la versión actual.",
          });
        }

        const nextVersion = profile.version + 1;
        const now = new Date();

        await tx
          .update(businessProfiles)
          .set({
            status: "unpublished",
            version: nextVersion,
            updatedAt: now,
          })
          .where(eq(businessProfiles.orgId, org.id));

        await this.audit.record({
          orgId: org.id,
          actorUserId: userId,
          via: "panel",
          action: "profile.unpublished",
          target: org.id,
          metadata: { version: nextVersion },
          ip: reqIp,
        });

        const [updated] = await tx.select().from(businessProfiles).where(eq(businessProfiles.orgId, org.id));
        if (!updated) {
          throw new NotFoundException({ code: "profile_not_found", message: "Perfil no encontrado" });
        }
        const assembled = await this.assemblePrivateProfile(updated, org.id, tx);
        return { status: 200, body: assembled };
      },
    );

    return result.body;
  }

  async getLocations(userId: string, limit = 20, cursor?: string): Promise<LocationPage> {
    const org = await this.getOwnerOrg(userId);
    const [profile] = await this.db
      .select({ version: businessProfiles.version })
      .from(businessProfiles)
      .where(eq(businessProfiles.orgId, org.id));
    const version = profile?.version ?? 1;

    const effectiveLimit = Math.min(Math.max(1, limit), BUSINESS_LIMITS.locations);
    const rows = await this.db
      .select()
      .from(businessLocations)
      .where(and(eq(businessLocations.orgId, org.id), cursor ? gt(businessLocations.id, cursor) : undefined))
      .orderBy(asc(businessLocations.id))
      .limit(effectiveLimit + 1);

    const items: PrivateLocation[] = rows.slice(0, effectiveLimit).map((r) => ({
      id: r.id,
      version,
      location: {
        name: r.name,
        country: r.country as PrivateLocation["location"]["country"],
        region: r.region,
        locality: r.locality,
        address: r.address,
        postalCode: r.postalCode,
        addressVisibility: r.addressVisibility as "public" | "locality",
        latitude: r.latitude,
        longitude: r.longitude,
      },
    }));

    const nextCursor = rows.length > effectiveLimit ? (items.at(-1)?.id ?? null) : null;
    return { items, nextCursor };
  }

  async createLocation(
    userId: string,
    idempotencyKey: string,
    body: CreateBusinessLocation,
    reqIp?: string,
  ): Promise<PrivateLocation> {
    const org = await this.getOwnerOrg(userId);

    const result = await this.executeIdempotent<PrivateLocation>(
      idempotencyKey,
      userId,
      org.id,
      "business_profile.location.create",
      body,
      async (tx) => {
        const [profile] = await tx
          .select()
          .from(businessProfiles)
          .where(eq(businessProfiles.orgId, org.id))
          .for("update");
        if (!profile) {
          throw new NotFoundException({ code: "profile_not_found", message: "Perfil no encontrado" });
        }

        if (profile.version !== body.expectedVersion) {
          throw new ConflictException({
            code: "profile_conflict",
            message: "El perfil cambió en otro dispositivo. Recarga para ver la versión actual.",
          });
        }

        const [countRow] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(businessLocations)
          .where(eq(businessLocations.orgId, org.id));
        if ((countRow?.count ?? 0) >= BUSINESS_LIMITS.locations) {
          throw new UnprocessableEntityException({
            code: "max_locations_exceeded",
            message: "Alcanzaste el límite máximo de sedes permitidas.",
          });
        }

        const locationId = uuidv7();
        const localityKey = normalizeLocalityKey(body.location.locality);
        const nextVersion = profile.version + 1;
        const now = new Date();

        await tx.insert(businessLocations).values({
          id: locationId,
          orgId: org.id,
          name: body.location.name,
          country: body.location.country,
          region: body.location.region,
          locality: body.location.locality,
          localityKey,
          address: body.location.address,
          postalCode: body.location.postalCode,
          addressVisibility: body.location.addressVisibility,
          latitude: body.location.latitude,
          longitude: body.location.longitude,
        });

        await tx
          .update(businessProfiles)
          .set({ version: nextVersion, updatedAt: now })
          .where(eq(businessProfiles.orgId, org.id));

        await this.audit.record({
          orgId: org.id,
          actorUserId: userId,
          via: "panel",
          action: "location.created",
          target: locationId,
          metadata: { version: nextVersion },
          ip: reqIp,
        });

        const privateLocation: PrivateLocation = {
          id: locationId,
          version: nextVersion,
          location: body.location,
        };
        return { status: 201, body: privateLocation };
      },
    );

    return result.body;
  }

  async updateLocation(
    userId: string,
    locationId: string,
    idempotencyKey: string,
    body: CreateBusinessLocation,
    reqIp?: string,
  ): Promise<PrivateLocation> {
    const org = await this.getOwnerOrg(userId);

    const result = await this.executeIdempotent<PrivateLocation>(
      idempotencyKey,
      userId,
      org.id,
      "business_profile.location.update",
      { locationId, ...body },
      async (tx) => {
        const [profile] = await tx
          .select()
          .from(businessProfiles)
          .where(eq(businessProfiles.orgId, org.id))
          .for("update");
        if (!profile) {
          throw new NotFoundException({ code: "profile_not_found", message: "Perfil no encontrado" });
        }

        if (profile.version !== body.expectedVersion) {
          throw new ConflictException({
            code: "profile_conflict",
            message: "El perfil cambió en otro dispositivo. Recarga para ver la versión actual.",
          });
        }

        const [existing] = await tx
          .select()
          .from(businessLocations)
          .where(and(eq(businessLocations.id, locationId), eq(businessLocations.orgId, org.id)));
        if (!existing) {
          throw new NotFoundException({ code: "location_not_found", message: "Sede no encontrada" });
        }

        const localityKey = normalizeLocalityKey(body.location.locality);
        const nextVersion = profile.version + 1;
        const now = new Date();

        await tx
          .update(businessLocations)
          .set({
            name: body.location.name,
            country: body.location.country,
            region: body.location.region,
            locality: body.location.locality,
            localityKey,
            address: body.location.address,
            postalCode: body.location.postalCode,
            addressVisibility: body.location.addressVisibility,
            latitude: body.location.latitude,
            longitude: body.location.longitude,
            updatedAt: now,
          })
          .where(and(eq(businessLocations.id, locationId), eq(businessLocations.orgId, org.id)));

        await tx
          .update(businessProfiles)
          .set({ version: nextVersion, updatedAt: now })
          .where(eq(businessProfiles.orgId, org.id));

        await this.audit.record({
          orgId: org.id,
          actorUserId: userId,
          via: "panel",
          action: "location.updated",
          target: locationId,
          metadata: { version: nextVersion },
          ip: reqIp,
        });

        const privateLocation: PrivateLocation = {
          id: locationId,
          version: nextVersion,
          location: body.location,
        };
        return { status: 200, body: privateLocation };
      },
    );

    return result.body;
  }

  async deleteLocation(
    userId: string,
    locationId: string,
    idempotencyKey: string,
    body: ChangeBusinessPublication,
    reqIp?: string,
  ): Promise<void> {
    const org = await this.getOwnerOrg(userId);

    await this.executeIdempotent<null>(
      idempotencyKey,
      userId,
      org.id,
      "business_profile.location.delete",
      { locationId, ...body },
      async (tx) => {
        const [profile] = await tx
          .select()
          .from(businessProfiles)
          .where(eq(businessProfiles.orgId, org.id))
          .for("update");
        if (!profile) {
          throw new NotFoundException({ code: "profile_not_found", message: "Perfil no encontrado" });
        }

        if (profile.version !== body.expectedVersion) {
          throw new ConflictException({
            code: "profile_conflict",
            message: "El perfil cambió en otro dispositivo. Recarga para ver la versión actual.",
          });
        }

        const [existing] = await tx
          .select()
          .from(businessLocations)
          .where(and(eq(businessLocations.id, locationId), eq(businessLocations.orgId, org.id)));
        if (!existing) {
          throw new NotFoundException({ code: "location_not_found", message: "Sede no encontrada" });
        }

        const [attached] = await tx
          .select({ calendarId: businessCalendarLocations.calendarId })
          .from(businessCalendarLocations)
          .where(
            and(
              eq(businessCalendarLocations.locationId, locationId),
              eq(businessCalendarLocations.orgId, org.id),
            ),
          )
          .limit(1);
        if (attached) {
          throw new ConflictException({
            code: "location_in_use",
            message: "Desvincula los calendarios asociados a esta sede antes de eliminarla.",
          });
        }

        await tx
          .delete(businessLocations)
          .where(and(eq(businessLocations.id, locationId), eq(businessLocations.orgId, org.id)));

        const nextVersion = profile.version + 1;
        const now = new Date();

        await tx
          .update(businessProfiles)
          .set({ version: nextVersion, updatedAt: now })
          .where(eq(businessProfiles.orgId, org.id));

        await this.audit.record({
          orgId: org.id,
          actorUserId: userId,
          via: "panel",
          action: "location.deleted",
          target: locationId,
          metadata: { version: nextVersion },
          ip: reqIp,
        });

        return { status: 204, body: null };
      },
    );
  }

  async assignCalendarLocation(
    userId: string,
    calendarId: string,
    idempotencyKey: string,
    body: AssignBusinessCalendar,
    reqIp?: string,
  ): Promise<PrivateBusinessProfile> {
    const org = await this.getOwnerOrg(userId);

    const result = await this.executeIdempotent<PrivateBusinessProfile>(
      idempotencyKey,
      userId,
      org.id,
      "business_profile.calendar_location.assign",
      { calendarId, ...body },
      async (tx) => {
        const [profile] = await tx
          .select()
          .from(businessProfiles)
          .where(eq(businessProfiles.orgId, org.id))
          .for("update");
        if (!profile) {
          throw new NotFoundException({ code: "profile_not_found", message: "Perfil no encontrado" });
        }

        if (profile.version !== body.expectedVersion) {
          throw new ConflictException({
            code: "profile_conflict",
            message: "El perfil cambió en otro dispositivo. Recarga para ver la versión actual.",
          });
        }

        const [proj] = await tx
          .select()
          .from(businessCalendarProjection)
          .where(
            and(
              eq(businessCalendarProjection.calendarId, calendarId),
              eq(businessCalendarProjection.orgId, org.id),
            ),
          );
        if (!proj) {
          const [member] = await tx
            .select()
            .from(calendarMembers)
            .where(and(eq(calendarMembers.calendarId, calendarId), eq(calendarMembers.orgId, org.id)));
          if (!member) {
            throw new NotFoundException({
              code: "calendar_not_found",
              message: "Calendario no encontrado",
            });
          }
          await tx
            .insert(businessCalendarProjection)
            .values({
              calendarId,
              orgId: org.id,
              aggregateVersion: 1,
              state: "active",
              slug: calendarId,
              hasActiveServices: false,
            })
            .onConflictDoNothing();
        }

        if (body.locationId !== null) {
          const [loc] = await tx
            .select()
            .from(businessLocations)
            .where(and(eq(businessLocations.id, body.locationId), eq(businessLocations.orgId, org.id)));
          if (!loc) {
            throw new UnprocessableEntityException({
              code: "invalid_location",
              message: "La sede no pertenece a tu organización",
            });
          }

          await tx
            .insert(businessCalendarLocations)
            .values({
              calendarId,
              orgId: org.id,
              locationId: body.locationId,
            })
            .onConflictDoUpdate({
              target: businessCalendarLocations.calendarId,
              set: {
                locationId: body.locationId,
                updatedAt: new Date(),
              },
            });
        } else {
          await tx
            .delete(businessCalendarLocations)
            .where(
              and(
                eq(businessCalendarLocations.calendarId, calendarId),
                eq(businessCalendarLocations.orgId, org.id),
              ),
            );
        }

        const nextVersion = profile.version + 1;
        const now = new Date();

        await tx
          .update(businessProfiles)
          .set({ version: nextVersion, updatedAt: now })
          .where(eq(businessProfiles.orgId, org.id));

        await this.audit.record({
          orgId: org.id,
          actorUserId: userId,
          via: "panel",
          action: "calendar_location.assigned",
          target: calendarId,
          metadata: { version: nextVersion, locationId: body.locationId },
          ip: reqIp,
        });

        const [updated] = await tx.select().from(businessProfiles).where(eq(businessProfiles.orgId, org.id));
        if (!updated) {
          throw new NotFoundException({ code: "profile_not_found", message: "Perfil no encontrado" });
        }
        const assembled = await this.assemblePrivateProfile(updated, org.id, tx);
        return { status: 200, body: assembled };
      },
    );

    return result.body;
  }

  private async checkMissingRequirements(
    profile: typeof businessProfiles.$inferSelect,
    orgId: string,
    tx: Database,
  ): Promise<
    (
      | "display_name"
      | "description"
      | "primary_category"
      | "location"
      | "active_calendar"
      | "active_service"
    )[]
  > {
    const missing: (
      | "display_name"
      | "description"
      | "primary_category"
      | "location"
      | "active_calendar"
      | "active_service"
    )[] = [];

    if (!profile.displayName.trim()) missing.push("display_name");
    if (!profile.description.trim()) missing.push("description");
    if (!profile.primaryCategoryId) missing.push("primary_category");

    const [locCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(businessLocations)
      .where(eq(businessLocations.orgId, orgId));
    if ((locCount?.count ?? 0) === 0) missing.push("location");

    const [activeCalCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(businessCalendarProjection)
      .where(
        and(eq(businessCalendarProjection.orgId, orgId), eq(businessCalendarProjection.state, "active")),
      );
    if ((activeCalCount?.count ?? 0) === 0) missing.push("active_calendar");

    const [activeSvcCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(businessCalendarProjection)
      .where(
        and(
          eq(businessCalendarProjection.orgId, orgId),
          eq(businessCalendarProjection.state, "active"),
          eq(businessCalendarProjection.hasActiveServices, true),
        ),
      );
    if ((activeSvcCount?.count ?? 0) === 0) missing.push("active_service");

    return missing;
  }

  private async assemblePrivateProfile(
    profile: typeof businessProfiles.$inferSelect,
    orgId: string,
    tx: Database,
  ): Promise<PrivateBusinessProfile> {
    const categories = await tx
      .select()
      .from(businessProfileCategories)
      .where(eq(businessProfileCategories.orgId, orgId));
    const social = await tx.select().from(businessSocialLinks).where(eq(businessSocialLinks.orgId, orgId));
    const requirements = await this.checkMissingRequirements(profile, orgId, tx);

    return {
      businessId: orgId,
      version: profile.version,
      status: profile.status as PrivateBusinessProfile["status"],
      content: {
        displayName: profile.displayName,
        description: profile.description,
        primaryCategory: profile.primaryCategoryId as PrivateBusinessProfile["content"]["primaryCategory"],
        secondaryCategories: categories.map(
          (c) => c.categoryId as PrivateBusinessProfile["content"]["secondaryCategories"][number],
        ),
        websiteUrl: profile.websiteUrl ?? null,
        termsUrl: profile.termsUrl ?? null,
        socialLinks: social.map((s) => ({
          platform: s.platform as PrivateBusinessProfile["content"]["socialLinks"][number]["platform"],
          url: s.url,
        })),
      },
      requirements,
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  async uploadImage(
    userId: string,
    idempotencyKey: string,
    payload: { expectedVersion: number; alt: string; fileBuffer: Buffer },
    ip?: string,
  ): Promise<{ id: string; location: string }> {
    const org = await this.getOwnerOrg(userId);
    const fileHash = createHash("sha256").update(payload.fileBuffer).digest("hex");
    const result = await this.executeIdempotent<{ id: string; location: string }>(
      idempotencyKey,
      userId,
      org.id,
      "business_profile.image_upload",
      { expectedVersion: payload.expectedVersion, alt: payload.alt, fileHash },
      async (tx) => {
        const [profile] = await tx
          .select({ version: businessProfiles.version })
          .from(businessProfiles)
          .where(eq(businessProfiles.orgId, org.id))
          .for("update");
        if (!profile) {
          throw new NotFoundException({ code: "business_not_found", message: "Perfil no encontrado" });
        }
        if (profile.version !== payload.expectedVersion) {
          throw new ConflictException({
            code: "profile_conflict",
            message: "Versión de perfil no coincide",
          });
        }

        const existingImages = await tx.select().from(businessImages).where(eq(businessImages.orgId, org.id));
        if (existingImages.length >= BUSINESS_LIMITS.images) {
          throw new UnprocessableEntityException({
            code: "image_limit_reached",
            message: "Alcanzaste el límite de 10 imágenes por perfil.",
          });
        }

        const imageId = uuidv7();
        const storageKey = `img_${imageId.replaceAll("-", "")}`;
        const processed = await this.imageService.processAndSave(org.id, imageId, payload.fileBuffer);

        const currentBytes = existingImages.reduce((sum, img) => sum + img.bytes, 0);
        if (currentBytes + processed.bytes > 41943040) {
          await this.imageService.deleteImageFiles(org.id, imageId);
          throw new UnprocessableEntityException({
            code: "media_quota_exceeded",
            message: "Alcanzaste la cuota máxima de 40 MiB en imágenes.",
          });
        }

        const hasCover = existingImages.some((img) => img.cover);
        const cover = !hasCover;
        const position = existingImages.length;

        try {
          await tx.insert(businessImages).values({
            id: imageId,
            orgId: org.id,
            storageKey,
            mimeType: processed.mimeType,
            bytes: processed.bytes,
            width: processed.width,
            height: processed.height,
            alt: payload.alt.trim(),
            position,
            cover,
          });

          await tx
            .update(businessProfiles)
            .set({
              version: sql`${businessProfiles.version} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(businessProfiles.orgId, org.id));

          await this.audit.record({
            orgId: org.id,
            actorUserId: userId,
            via: "panel",
            action: "business_profile.image_uploaded",
            target: imageId,
            ip,
            metadata: {
              imageId,
              bytes: processed.bytes,
              width: processed.width,
              height: processed.height,
              cover,
            },
          });
        } catch (err) {
          await this.imageService.deleteImageFiles(org.id, imageId);
          throw err;
        }

        const location = `/api/business-profile/images/${imageId}/display`;
        return {
          status: 201,
          body: { id: imageId, location },
        };
      },
    );
    return result.body;
  }

  async updateImages(
    userId: string,
    idempotencyKey: string,
    body: UpdateBusinessImages,
    ip?: string,
  ): Promise<PrivateBusinessProfile> {
    const org = await this.getOwnerOrg(userId);
    const result = await this.executeIdempotent<PrivateBusinessProfile>(
      idempotencyKey,
      userId,
      org.id,
      "business_profile.images_update",
      body,
      async (tx) => {
        const [profile] = await tx
          .select({ version: businessProfiles.version })
          .from(businessProfiles)
          .where(eq(businessProfiles.orgId, org.id))
          .for("update");
        if (!profile) {
          throw new NotFoundException({ code: "business_not_found", message: "Perfil no encontrado" });
        }
        if (profile.version !== body.expectedVersion) {
          throw new ConflictException({
            code: "profile_conflict",
            message: "Versión de perfil no coincide",
          });
        }

        const currentImages = await tx.select().from(businessImages).where(eq(businessImages.orgId, org.id));
        const ownedMap = new Map(currentImages.map((i) => [i.id, i]));

        for (const img of body.images) {
          if (!ownedMap.has(img.id)) {
            throw new UnprocessableEntityException({
              code: "invalid_image",
              message: "Una de las imágenes no pertenece a este perfil",
            });
          }
        }

        await tx.update(businessImages).set({ cover: false }).where(eq(businessImages.orgId, org.id));

        for (let i = 0; i < body.images.length; i++) {
          const img = body.images[i];
          if (!img) continue;
          await tx
            .update(businessImages)
            .set({
              alt: img.alt.trim(),
              cover: img.cover,
              position: i,
              updatedAt: new Date(),
            })
            .where(and(eq(businessImages.id, img.id), eq(businessImages.orgId, org.id)));
        }

        await tx
          .update(businessProfiles)
          .set({
            version: sql`${businessProfiles.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(businessProfiles.orgId, org.id));

        await this.audit.record({
          orgId: org.id,
          actorUserId: userId,
          via: "panel",
          action: "business_profile.images_reordered",
          target: org.id,
          ip,
          metadata: { imageCount: body.images.length },
        });

        const [updated] = await tx.select().from(businessProfiles).where(eq(businessProfiles.orgId, org.id));
        if (!updated) {
          throw new NotFoundException({ code: "profile_not_found", message: "Perfil no encontrado" });
        }
        const assembled = await this.assemblePrivateProfile(updated, org.id, tx);
        return {
          status: 200,
          body: assembled,
        };
      },
    );
    return result.body;
  }

  async deleteImage(
    userId: string,
    imageId: string,
    idempotencyKey: string,
    body: ChangeBusinessPublication,
    ip?: string,
  ): Promise<void> {
    const org = await this.getOwnerOrg(userId);
    await this.executeIdempotent<void>(
      idempotencyKey,
      userId,
      org.id,
      "business_profile.image_delete",
      { imageId, ...body },
      async (tx) => {
        const [profile] = await tx
          .select({ version: businessProfiles.version })
          .from(businessProfiles)
          .where(eq(businessProfiles.orgId, org.id))
          .for("update");
        if (!profile) {
          throw new NotFoundException({ code: "business_not_found", message: "Perfil no encontrado" });
        }
        if (profile.version !== body.expectedVersion) {
          throw new ConflictException({
            code: "profile_conflict",
            message: "Versión de perfil no coincide",
          });
        }

        const [existing] = await tx
          .select()
          .from(businessImages)
          .where(and(eq(businessImages.id, imageId), eq(businessImages.orgId, org.id)));
        if (!existing) {
          throw new NotFoundException({
            code: "image_not_found",
            message: "Imagen no encontrada",
          });
        }

        await tx
          .delete(businessImages)
          .where(and(eq(businessImages.id, imageId), eq(businessImages.orgId, org.id)));

        if (existing.cover) {
          const [nextCover] = await tx
            .select()
            .from(businessImages)
            .where(eq(businessImages.orgId, org.id))
            .orderBy(asc(businessImages.position))
            .limit(1);
          if (nextCover) {
            await tx
              .update(businessImages)
              .set({ cover: true, updatedAt: new Date() })
              .where(eq(businessImages.id, nextCover.id));
          }
        }

        await tx
          .update(businessProfiles)
          .set({
            version: sql`${businessProfiles.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(businessProfiles.orgId, org.id));

        await this.audit.record({
          orgId: org.id,
          actorUserId: userId,
          via: "panel",
          action: "business_profile.image_deleted",
          target: imageId,
          ip,
          metadata: { imageId },
        });

        await this.imageService.deleteImageFiles(org.id, imageId);

        return {
          status: 204,
          body: undefined,
        };
      },
    );
  }

  async getImageFile(
    userId: string,
    imageId: string,
    variantParam: string,
  ): Promise<{ filePath: string; mimeType: string }> {
    if (variantParam !== "thumbnail" && variantParam !== "display") {
      throw new BadRequestException({
        code: "invalid_image_variant",
        message: "Variante de imagen no válida",
      });
    }
    const variant = variantParam as "thumbnail" | "display";
    const org = await this.getOwnerOrg(userId);
    const [image] = await this.db
      .select()
      .from(businessImages)
      .where(and(eq(businessImages.id, imageId), eq(businessImages.orgId, org.id)));
    if (!image) {
      throw new NotFoundException({ code: "image_not_found", message: "Imagen no encontrada" });
    }

    const filePath = this.imageService.getImageFilePath(org.id, imageId, variant);
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException({ code: "image_not_found", message: "Archivo de imagen no encontrado" });
    }
    return { filePath, mimeType: "image/webp" };
  }

  async getPublicImageFile(
    businessId: string,
    imageId: string,
    variantParam: string,
  ): Promise<{ filePath: string; mimeType: string }> {
    if (variantParam !== "thumbnail" && variantParam !== "display") {
      throw new BadRequestException({
        code: "invalid_image_variant",
        message: "Variante de imagen no válida",
      });
    }
    const variant = variantParam as "thumbnail" | "display";

    const [profile] = await this.db
      .select({
        orgId: businessProfiles.orgId,
        status: businessProfiles.status,
        orgStatus: organizations.status,
      })
      .from(businessProfiles)
      .innerJoin(organizations, eq(organizations.id, businessProfiles.orgId))
      .where(and(eq(businessProfiles.orgId, businessId), isNull(organizations.deletedAt)));
    if (profile?.status !== "published" || profile?.orgStatus === "suspended") {
      throw new NotFoundException({ code: "image_not_found", message: "Imagen no encontrada" });
    }

    const [image] = await this.db
      .select()
      .from(businessImages)
      .where(and(eq(businessImages.id, imageId), eq(businessImages.orgId, profile.orgId)));
    if (!image) {
      throw new NotFoundException({ code: "image_not_found", message: "Imagen no encontrada" });
    }

    const filePath = this.imageService.getImageFilePath(profile.orgId, imageId, variant);
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException({ code: "image_not_found", message: "Archivo de imagen no encontrado" });
    }
    return { filePath, mimeType: "image/webp" };
  }
}
