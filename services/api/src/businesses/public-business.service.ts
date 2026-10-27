import { createHash } from "node:crypto";
import { ServiceCatalogService } from "@mcet/contracts/mcet/calendar/v1/services_pb";
import { categoryLabel, type Lang } from "@mcet/i18n";
import {
  BUSINESS_LIMITS,
  type BusinessCategory,
  type BusinessDirectoryPage,
  BusinessDirectoryQuery,
  type BusinessDirectoryQueryInput,
  type BusinessLocalitiesQuery,
  type BusinessSocialPlatform,
  type CategoryPage,
  type LocalityPage,
  type PublicBusinessLocation,
  type PublicBusinessProfile,
  type PublicBusinessSummary,
} from "@mcet/schemas";
import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import { type Database, DB } from "../db/db.module.js";
import {
  businessCategories,
  businessImages,
  businessLocations,
  businessProfileCategories,
  businessSocialLinks,
} from "../db/schema.js";
import { asActor, type CalendarClients } from "../internal-rpc/calendar-client.js";
import { CALENDAR } from "../internal-rpc/internal-rpc.module.js";
import { normalizeLocalityKey } from "./business-profile.service.js";

const pick = (m: Record<string, string>, lang: Lang) => m[lang] || Object.values(m)[0] || "";

function encodeCursor(data: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
}

function decodeCursor<T>(raw: string): T {
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as T;
  } catch {
    throw new UnprocessableEntityException({
      code: "invalid_cursor",
      message: "El cursor de paginación no es válido.",
    });
  }
}

@Injectable()
export class PublicBusinessService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Optional() @Inject(CALENDAR) private readonly calendarRpc?: CalendarClients,
  ) {}

  async listCategories(limit = 20, cursor?: string, lang: Lang = "es"): Promise<CategoryPage> {
    const effectiveLimit = Math.min(Math.max(1, limit), 100);

    let cursorObj: { position: number; code: string } | undefined;
    if (cursor) {
      cursorObj = decodeCursor<{ position: number; code: string }>(cursor);
    }

    const rows = await this.db
      .select({
        code: businessCategories.code,
        position: businessCategories.position,
      })
      .from(businessCategories)
      .where(
        cursorObj
          ? sql`${businessCategories.active} = true AND (${businessCategories.position} > ${cursorObj.position} OR (${businessCategories.position} = ${cursorObj.position} AND ${businessCategories.code} > ${cursorObj.code}))`
          : sql`${businessCategories.active} = true`,
      )
      .orderBy(businessCategories.position, businessCategories.code)
      .limit(effectiveLimit + 1);

    const items = rows.slice(0, effectiveLimit).map((r) => ({
      code: r.code as BusinessCategory,
      label: categoryLabel(r.code, lang),
    }));

    let nextCursor: string | null = null;
    if (rows.length > effectiveLimit) {
      const last = rows[effectiveLimit - 1];
      if (last) {
        nextCursor = encodeCursor({ position: last.position, code: last.code });
      }
    }

    return { items, nextCursor };
  }

  async listLocalities(query: BusinessLocalitiesQuery): Promise<LocalityPage> {
    const effectiveLimit = Math.min(Math.max(1, query.limit ?? 20), 100);
    const normalizedQ = normalizeLocalityKey(query.q);
    const country = query.country.toUpperCase();

    let cursorObj: { locality: string; region: string } | undefined;
    if (query.cursor) {
      cursorObj = decodeCursor<{ locality: string; region: string }>(query.cursor);
    }

    const regionClause = query.region ? sql`AND loc.region ILIKE ${`%${query.region.trim()}%`}` : sql``;
    const cursorClause = cursorObj
      ? sql`AND (LOWER(loc.locality) > LOWER(${cursorObj.locality}) OR (LOWER(loc.locality) = LOWER(${cursorObj.locality}) AND LOWER(loc.region) > LOWER(${cursorObj.region})))`
      : sql``;

    const res = await this.db.execute<{
      country: string;
      region: string;
      locality: string;
    }>(sql`
      SELECT country, region, locality
      FROM (
        SELECT DISTINCT loc.country, loc.region, loc.locality
        FROM app.business_locations loc
        JOIN app.business_profiles bp ON bp.org_id = loc.org_id
        JOIN app.organizations org ON org.id = bp.org_id
        WHERE bp.status = 'published'
          AND org.status <> 'suspended'
          AND org.deleted_at IS NULL
          AND loc.country = ${country}
          AND (
            loc.locality_key LIKE ${`%${normalizedQ}%`}
            OR loc.locality ILIKE ${`%${query.q.trim()}%`}
          )
          ${regionClause}
      ) loc
      WHERE 1=1
        ${cursorClause}
      ORDER BY LOWER(loc.locality) ASC, LOWER(loc.region) ASC
      LIMIT ${effectiveLimit + 1}
    `);

    const rows = res.rows as unknown as Array<{ country: string; region: string; locality: string }>;
    const items = rows.slice(0, effectiveLimit);

    let nextCursor: string | null = null;
    if (rows.length > effectiveLimit) {
      const last = rows[effectiveLimit - 1];
      if (last) {
        nextCursor = encodeCursor({ locality: last.locality, region: last.region });
      }
    }

    return { items, nextCursor };
  }

  async searchBusinesses(
    rawQuery: BusinessDirectoryQueryInput,
    _lang: Lang = "es",
  ): Promise<BusinessDirectoryPage> {
    const query = BusinessDirectoryQuery.parse(rawQuery);
    const effectiveLimit = Math.min(Math.max(1, query.limit ?? 20), BUSINESS_LIMITS.page);

    const filterKey = JSON.stringify({
      q: query.q ?? null,
      category: query.category ?? null,
      country: query.country ?? null,
      region: query.region ?? null,
      locality: query.locality ?? null,
      lat: query.lat ?? null,
      lng: query.lng ?? null,
      radiusKm: query.radiusKm ?? null,
      sort: query.sort,
    });
    const expectedFilterHash = createHash("sha256").update(filterKey).digest("hex").slice(0, 16);

    let cursorObj: { filterHash: string; distance?: number; name?: string; orgId: string } | undefined;
    if (query.cursor) {
      cursorObj = decodeCursor<{ filterHash: string; distance?: number; name?: string; orgId: string }>(
        query.cursor,
      );
      if (cursorObj.filterHash !== expectedFilterHash) {
        throw new UnprocessableEntityException({
          code: "mismatched_cursor",
          message: "El cursor de paginación no coincide con los filtros aplicados.",
        });
      }
    }

    const isDistance = query.lat !== undefined && query.lng !== undefined;

    let eligibleLocationsCte: ReturnType<typeof sql>;

    if (isDistance) {
      const lat = query.lat ?? 0;
      const lng = query.lng ?? 0;
      const radiusKm = query.radiusKm ?? 10;
      const deltaLat = radiusKm / 111.32;
      const minLat = Math.max(-90, lat - deltaLat);
      const maxLat = Math.min(90, lat + deltaLat);

      const radLat = (lat * Math.PI) / 180;
      const cosLat = Math.cos(radLat);
      const deltaLng = Math.abs(cosLat) > 0.001 ? radiusKm / (111.32 * Math.abs(cosLat)) : 180;

      let lngBoundingClause = sql``;
      if (Math.abs(lat) + deltaLat < 89.9 && deltaLng < 180) {
        let minLng = lng - deltaLng;
        let maxLng = lng + deltaLng;
        if (minLng < -180) {
          minLng += 360;
          lngBoundingClause = sql`AND (loc.longitude >= ${minLng} OR loc.longitude <= ${maxLng})`;
        } else if (maxLng > 180) {
          maxLng -= 360;
          lngBoundingClause = sql`AND (loc.longitude >= ${minLng} OR loc.longitude <= ${maxLng})`;
        } else {
          lngBoundingClause = sql`AND loc.longitude BETWEEN ${minLng} AND ${maxLng}`;
        }
      }

      eligibleLocationsCte = sql`
        WITH eligible_locations AS (
          SELECT DISTINCT ON (loc.org_id)
            loc.id AS location_id,
            loc.org_id,
            loc.name AS location_name,
            loc.country,
            loc.region,
            loc.locality,
            loc.address,
            loc.postal_code,
            loc.latitude,
            loc.longitude,
            loc.address_visibility,
            (2.0 * 6371.0 * ASIN(
              LEAST(1.0, SQRT(
                POWER(SIN(RADIANS(loc.latitude - ${lat}) / 2.0), 2) +
                COS(RADIANS(${lat})) * COS(RADIANS(loc.latitude)) *
                POWER(SIN(RADIANS(loc.longitude - ${lng}) / 2.0), 2)
              ))
            )) AS distance_km
          FROM app.business_locations loc
          WHERE loc.latitude IS NOT NULL
            AND loc.longitude IS NOT NULL
            AND loc.latitude BETWEEN ${minLat} AND ${maxLat}
            ${lngBoundingClause}
            AND (2.0 * 6371.0 * ASIN(
              LEAST(1.0, SQRT(
                POWER(SIN(RADIANS(loc.latitude - ${lat}) / 2.0), 2) +
                COS(RADIANS(${lat})) * COS(RADIANS(loc.latitude)) *
                POWER(SIN(RADIANS(loc.longitude - ${lng}) / 2.0), 2)
              ))
            )) <= ${radiusKm}
          ORDER BY loc.org_id, distance_km ASC, loc.id ASC
        )
      `;
    } else {
      const country = query.country?.toUpperCase() ?? "";
      const locality = query.locality?.trim() ?? "";
      const normalizedLocality = normalizeLocalityKey(locality);
      const regionClause = query.region ? sql`AND loc.region ILIKE ${`%${query.region.trim()}%`}` : sql``;

      eligibleLocationsCte = sql`
        WITH eligible_locations AS (
          SELECT DISTINCT ON (loc.org_id)
            loc.id AS location_id,
            loc.org_id,
            loc.name AS location_name,
            loc.country,
            loc.region,
            loc.locality,
            loc.address,
            loc.postal_code,
            loc.latitude,
            loc.longitude,
            loc.address_visibility,
            NULL::double precision AS distance_km
          FROM app.business_locations loc
          WHERE loc.country = ${country}
            AND (
              loc.locality_key = ${normalizedLocality}
              OR LOWER(loc.locality) = LOWER(${locality})
            )
            ${regionClause}
          ORDER BY loc.org_id, loc.id ASC
        )
      `;
    }

    const categoryClause = query.category
      ? sql`AND (
          bp.primary_category_id = ${query.category}
          OR EXISTS (
            SELECT 1 FROM app.business_profile_categories bpc
            WHERE bpc.org_id = bp.org_id AND bpc.category_id = ${query.category}
          )
        )`
      : sql``;

    const textClause = query.q
      ? sql`AND (
          bp.display_name ILIKE ${`%${query.q.trim()}%`}
          OR bp.description ILIKE ${`%${query.q.trim()}%`}
        )`
      : sql``;

    let cursorClause = sql``;
    let orderClause = sql`ORDER BY LOWER(bp.display_name) ASC, bp.org_id ASC`;

    if (query.sort === "distance" && isDistance) {
      orderClause = sql`ORDER BY el.distance_km ASC, bp.org_id ASC`;
      if (cursorObj && typeof cursorObj.distance === "number") {
        cursorClause = sql`AND (el.distance_km > ${cursorObj.distance} OR (el.distance_km = ${cursorObj.distance} AND bp.org_id > ${cursorObj.orgId}))`;
      }
    } else {
      if (cursorObj && typeof cursorObj.name === "string") {
        cursorClause = sql`AND (LOWER(bp.display_name) > LOWER(${cursorObj.name}) OR (LOWER(bp.display_name) = LOWER(${cursorObj.name}) AND bp.org_id > ${cursorObj.orgId}))`;
      }
    }

    const res = await this.db.execute<{
      org_id: string;
      display_name: string;
      description: string;
      primary_category_id: string;
      location_id: string;
      location_name: string;
      country: string;
      region: string;
      locality: string;
      address: string;
      postal_code: string;
      latitude: number | null;
      longitude: number | null;
      address_visibility: "public" | "locality";
      distance_km: number | null;
    }>(sql`
      ${eligibleLocationsCte}
      SELECT
        bp.org_id,
        bp.display_name,
        bp.description,
        bp.primary_category_id,
        el.location_id,
        el.location_name,
        el.country,
        el.region,
        el.locality,
        el.address,
        el.postal_code,
        el.latitude,
        el.longitude,
        el.address_visibility,
        el.distance_km
      FROM eligible_locations el
      JOIN app.business_profiles bp ON bp.org_id = el.org_id
      JOIN app.organizations org ON org.id = bp.org_id
      WHERE bp.status = 'published'
        AND org.status <> 'suspended'
        AND org.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM app.business_calendar_projection bcp
          WHERE bcp.org_id = bp.org_id AND bcp.state = 'active' AND bcp.has_active_services = true
        )
        ${categoryClause}
        ${textClause}
        ${cursorClause}
      ${orderClause}
      LIMIT ${effectiveLimit + 1}
    `);

    const rows = res.rows as unknown as Array<{
      org_id: string;
      display_name: string;
      description: string;
      primary_category_id: string;
      location_id: string;
      location_name: string;
      country: string;
      region: string;
      locality: string;
      address: string;
      postal_code: string;
      latitude: number | null;
      longitude: number | null;
      address_visibility: "public" | "locality";
      distance_km: number | null;
    }>;

    const itemsRows = rows.slice(0, effectiveLimit);
    const orgIds = itemsRows.map((r) => r.org_id);

    // Fetch covers for matched businesses
    const coverImages =
      orgIds.length > 0
        ? await this.db
            .select()
            .from(businessImages)
            .where(sql`${businessImages.orgId} IN ${orgIds} AND ${businessImages.cover} = true`)
        : [];
    const coverMap = new Map(coverImages.map((c) => [c.orgId, c]));

    // Fetch booking targets for matched locations
    const bookingTargetsMap = new Map<
      string,
      Array<{ calendarId: string; locationId: string; slug: string; bookingUrl: string; reservable: boolean }>
    >();
    if (itemsRows.length > 0) {
      for (const item of itemsRows) {
        const targetsRes = await this.db.execute<{
          calendar_id: string;
          location_id: string;
          slug: string;
          reservable: boolean;
        }>(sql`
          SELECT
            bcp.calendar_id,
            COALESCE(bcl.location_id, ${item.location_id}::uuid) AS location_id,
            bcp.slug,
            (bcp.state = 'active' AND bcp.has_active_services = true) AS reservable
          FROM app.business_calendar_projection bcp
          LEFT JOIN app.business_calendar_locations bcl
            ON bcl.calendar_id = bcp.calendar_id AND bcl.org_id = bcp.org_id
          WHERE bcp.org_id = ${item.org_id}
            AND bcp.state = 'active'
            AND (bcl.location_id = ${item.location_id}::uuid OR bcl.location_id IS NULL)
          ORDER BY bcp.calendar_id ASC
          LIMIT 10
        `);

        const tRows = targetsRes.rows as unknown as Array<{
          calendar_id: string;
          location_id: string;
          slug: string;
          reservable: boolean;
        }>;

        bookingTargetsMap.set(
          item.org_id,
          tRows.map((t) => ({
            calendarId: t.calendar_id,
            locationId: t.location_id,
            slug: t.slug,
            bookingUrl: `/c/${t.slug}`,
            reservable: t.reservable,
          })),
        );
      }
    }

    const items: PublicBusinessSummary[] = itemsRows.map((r) => {
      let location: PublicBusinessLocation;
      if (r.address_visibility === "locality") {
        location = {
          id: r.location_id,
          name: r.location_name,
          country: r.country as PublicBusinessLocation["country"],
          region: r.region,
          locality: r.locality,
          addressVisibility: "locality",
        };
      } else {
        location = {
          id: r.location_id,
          name: r.location_name,
          country: r.country as PublicBusinessLocation["country"],
          region: r.region,
          locality: r.locality,
          addressVisibility: "public",
          address: r.address,
          postalCode: r.postal_code,
          latitude: r.latitude,
          longitude: r.longitude,
        };
      }

      const coverImg = coverMap.get(r.org_id);
      const cover = coverImg
        ? {
            id: coverImg.id,
            alt: coverImg.alt,
            cover: true,
            url: `/api/public/v1/businesses/${r.org_id}/images/${coverImg.id}/thumbnail` as const,
          }
        : null;

      const summaryText = r.description.trim().slice(0, 255);

      return {
        businessId: r.org_id,
        displayName: r.display_name,
        primaryCategory: r.primary_category_id as BusinessCategory,
        summary: summaryText,
        cover,
        location,
        profileUrl: `/b/${r.org_id}`,
        bookingTargets: bookingTargetsMap.get(r.org_id) ?? [],
        distanceKm: r.distance_km != null ? Math.round(r.distance_km * 10) / 10 : null,
      };
    });

    let nextCursor: string | null = null;
    if (rows.length > effectiveLimit) {
      const last = rows[effectiveLimit - 1];
      if (last) {
        if (query.sort === "distance" && isDistance) {
          nextCursor = encodeCursor({
            filterHash: expectedFilterHash,
            distance: last.distance_km ?? 0,
            orgId: last.org_id,
          });
        } else {
          nextCursor = encodeCursor({
            filterHash: expectedFilterHash,
            name: last.display_name,
            orgId: last.org_id,
          });
        }
      }
    }

    return { items, nextCursor };
  }

  async getPublicProfile(businessId: string, lang: Lang = "es"): Promise<PublicBusinessProfile> {
    const res = await this.db.execute<{
      org_id: string;
      display_name: string;
      description: string;
      primary_category_id: string;
      website_url: string | null;
      terms_url: string | null;
      status: string;
    }>(sql`
      SELECT
        bp.org_id,
        bp.display_name,
        bp.description,
        bp.primary_category_id,
        bp.website_url,
        bp.terms_url,
        bp.status
      FROM app.business_profiles bp
      JOIN app.organizations org ON org.id = bp.org_id
      WHERE bp.org_id = ${businessId}
        AND bp.status = 'published'
        AND org.status <> 'suspended'
        AND org.deleted_at IS NULL
    `);

    const rows = res.rows as unknown as Array<{
      org_id: string;
      display_name: string;
      description: string;
      primary_category_id: string;
      website_url: string | null;
      terms_url: string | null;
      status: string;
    }>;
    const profile = rows[0];

    if (!profile) {
      throw new NotFoundException({
        code: "profile_not_found",
        message: "Negocio no encontrado.",
      });
    }

    // Secondary categories
    const catRows = await this.db
      .select({ categoryId: businessProfileCategories.categoryId })
      .from(businessProfileCategories)
      .where(sql`${businessProfileCategories.orgId} = ${businessId}`);
    const secondaryCategories = catRows.map((c) => c.categoryId as BusinessCategory);

    // Social links
    const socialRows = await this.db
      .select({ platform: businessSocialLinks.platform, url: businessSocialLinks.url })
      .from(businessSocialLinks)
      .where(sql`${businessSocialLinks.orgId} = ${businessId}`);
    const socialLinks = socialRows.map((s) => ({
      platform: s.platform as BusinessSocialPlatform,
      url: s.url,
    }));

    // Locations
    const locRows = await this.db
      .select()
      .from(businessLocations)
      .where(sql`${businessLocations.orgId} = ${businessId}`)
      .orderBy(businessLocations.createdAt);

    const locations: PublicBusinessLocation[] = locRows.map((l) => {
      if (l.addressVisibility === "locality") {
        return {
          id: l.id,
          name: l.name,
          country: l.country as PublicBusinessLocation["country"],
          region: l.region,
          locality: l.locality,
          addressVisibility: "locality",
        };
      }
      return {
        id: l.id,
        name: l.name,
        country: l.country as PublicBusinessLocation["country"],
        region: l.region,
        locality: l.locality,
        addressVisibility: "public",
        address: l.address,
        postalCode: l.postalCode,
        latitude: l.latitude,
        longitude: l.longitude,
      };
    });

    // Images
    const imgRows = await this.db
      .select()
      .from(businessImages)
      .where(sql`${businessImages.orgId} = ${businessId}`)
      .orderBy(businessImages.position);

    const images = imgRows.map((img) => ({
      id: img.id,
      alt: img.alt,
      cover: img.cover,
      url: `/api/public/v1/businesses/${businessId}/images/${img.id}/display` as const,
    }));

    // Booking targets
    const targetsRes = await this.db.execute<{
      calendar_id: string;
      location_id: string | null;
      slug: string;
      reservable: boolean;
    }>(sql`
      SELECT
        bcp.calendar_id,
        bcl.location_id,
        bcp.slug,
        (bcp.state = 'active' AND bcp.has_active_services = true) AS reservable
      FROM app.business_calendar_projection bcp
      LEFT JOIN app.business_calendar_locations bcl
        ON bcl.calendar_id = bcp.calendar_id AND bcl.org_id = bcp.org_id
      WHERE bcp.org_id = ${businessId}
        AND bcp.state = 'active'
      ORDER BY bcp.calendar_id ASC
      LIMIT 10
    `);

    const defaultLocationId = locations[0]?.id ?? "00000000-0000-0000-0000-000000000000";
    const bookingTargets = (
      targetsRes.rows as unknown as Array<{
        calendar_id: string;
        location_id: string | null;
        slug: string;
        reservable: boolean;
      }>
    ).map((t) => ({
      calendarId: t.calendar_id,
      locationId: t.location_id ?? defaultLocationId,
      slug: t.slug,
      bookingUrl: `/c/${t.slug}`,
      reservable: t.reservable,
    }));

    // Active services via RPC
    const services: Array<{
      calendarId: string;
      serviceId: string;
      name: string;
      description: string;
      durationMinutes: number;
    }> = [];

    if (this.calendarRpc && bookingTargets.length > 0) {
      const actorOpts = asActor({ actor: { role: "customer", via: "public", loc: lang } });
      for (const target of bookingTargets) {
        if (services.length >= 100) break;
        try {
          const resp = await this.calendarRpc
            .client(ServiceCatalogService)
            .listServices({ calendarId: target.calendarId, includeInactive: false }, actorOpts);
          for (const svc of resp.services) {
            if (services.length >= 100) break;
            services.push({
              calendarId: target.calendarId,
              serviceId: svc.id,
              name: pick(svc.name, lang),
              description: pick(svc.description, lang),
              durationMinutes: svc.durationMin,
            });
          }
        } catch {
          // If a calendar service fetch fails, continue with remaining targets
        }
      }
    }

    const reservable = bookingTargets.some((b) => b.reservable);

    return {
      businessId,
      displayName: profile.display_name,
      description: profile.description,
      primaryCategory: profile.primary_category_id as BusinessCategory,
      secondaryCategories,
      websiteUrl: profile.website_url,
      termsUrl: profile.terms_url,
      socialLinks,
      locations,
      images,
      bookingTargets,
      services,
      nextServicesCursor: null,
      reservable,
    };
  }
}
