import { z } from "zod";
import { Country } from "./common.ts";
import { MULTI_LINE, SINGLE_LINE } from "./text-policy.ts";

/** Nuevos contratos: puntos de código Unicode; no cambia los contratos UTF-16 publicados. */
export const BUSINESS_LIMITS = {
  displayName: 120,
  description: 5000,
  url: 2048,
  address: 200,
  locality: 200,
  region: 200,
  postalCode: 10,
  query: 100,
  locationName: 150,
  alt: 255,
  categories: 5,
  locations: 10,
  images: 10,
  imageBytes: 5 * 1024 * 1024,
  imagePixels: 25000000,
  storedMediaBytes: 40 * 1024 * 1024,
  socialLinks: 8,
  page: 100,
  cursor: 2048,
} as const;

const text = (max: number, multiline = false) =>
  z
    .string()
    .trim()
    .regex(multiline ? MULTI_LINE : SINGLE_LINE)
    .refine((s) => Array.from(s).length <= max, {
      message: "too_long",
      params: { max },
    });
const Id = z.uuid();
export const BusinessVersion = z.number().int().min(1).max(2147483647);
export const BusinessStatus = z.enum(["draft", "published", "unpublished"]);
export const BusinessCategory = z.enum([
  "health",
  "beauty",
  "wellness",
  "sport",
  "education",
  "consulting",
  "professional_services",
  "home",
  "automotive",
  "pets",
  "events",
  "other",
]);
export const BusinessSocialPlatform = z.enum([
  "facebook",
  "instagram",
  "linkedin",
  "youtube",
  "tiktok",
  "x",
  "threads",
  "pinterest",
]);
export type BusinessSocialPlatform = z.infer<typeof BusinessSocialPlatform>;
const SOCIAL_HOSTS: Record<z.infer<typeof BusinessSocialPlatform>, readonly string[]> = {
  facebook: ["facebook.com", "www.facebook.com"],
  instagram: ["instagram.com", "www.instagram.com"],
  linkedin: ["linkedin.com", "www.linkedin.com"],
  youtube: ["youtube.com", "www.youtube.com", "youtu.be"],
  tiktok: ["tiktok.com", "www.tiktok.com"],
  x: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
  threads: ["threads.net", "www.threads.net", "threads.com", "www.threads.com"],
  pinterest: ["pinterest.com", "www.pinterest.com"],
};
export const BusinessUrl = text(BUSINESS_LIMITS.url).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}, "invalid_url");
/** Server-generated destinations may be relative so local HTTP environments remain valid. */
export const BusinessResourceUrl = BusinessUrl.or(
  text(BUSINESS_LIMITS.url).regex(/^\/(?!\/)(?!.*\\)[^\s]*$/u),
);
export const BusinessSocialLink = z
  .object({
    platform: BusinessSocialPlatform,
    url: BusinessUrl,
  })
  .strict()
  .refine(
    (link) => {
      try {
        return SOCIAL_HOSTS[link.platform].includes(new URL(link.url).hostname);
      } catch {
        return false;
      }
    },
    { message: "invalid_social_host", path: ["url"] },
  );

const categories = z
  .array(BusinessCategory)
  .max(BUSINESS_LIMITS.categories - 1)
  .refine((values) => new Set(values).size === values.length, "duplicate_category");
const socialLinks = z
  .array(BusinessSocialLink)
  .max(BUSINESS_LIMITS.socialLinks)
  .refine((values) => new Set(values.map((v) => v.platform)).size === values.length, "duplicate_platform");
const profileFields = {
  displayName: text(BUSINESS_LIMITS.displayName).min(1),
  description: text(BUSINESS_LIMITS.description, true),
  primaryCategory: BusinessCategory.nullable(),
  secondaryCategories: categories,
  websiteUrl: BusinessUrl.nullable(),
  termsUrl: BusinessUrl.nullable(),
  socialLinks,
};
export const BusinessProfileContent = z
  .object(profileFields)
  .strict()
  .refine((p) => !p.primaryCategory || !p.secondaryCategories.includes(p.primaryCategory), {
    message: "duplicate_category",
    path: ["secondaryCategories"],
  });
export type BusinessProfileContent = z.infer<typeof BusinessProfileContent>;
/** PUT-like content within PATCH: complete editable content avoids ambiguous list merges. */
export const UpdateBusinessProfile = z
  .object({
    expectedVersion: BusinessVersion,
    ...profileFields,
  })
  .strict()
  .refine((p) => !p.primaryCategory || !p.secondaryCategories.includes(p.primaryCategory), {
    message: "duplicate_category",
    path: ["secondaryCategories"],
  });
export type UpdateBusinessProfile = z.infer<typeof UpdateBusinessProfile>;
export const ChangeBusinessPublication = z.object({ expectedVersion: BusinessVersion }).strict();

export const BusinessLocationContent = z
  .object({
    name: text(BUSINESS_LIMITS.locationName).min(1),
    country: Country,
    region: text(BUSINESS_LIMITS.region),
    locality: text(BUSINESS_LIMITS.locality).min(1),
    address: text(BUSINESS_LIMITS.address),
    postalCode: text(BUSINESS_LIMITS.postalCode),
    addressVisibility: z.enum(["public", "locality"]),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
  })
  .strict()
  .refine((p) => (p.latitude === null) === (p.longitude === null), {
    message: "invalid_location",
    path: ["latitude"],
  });
export const CreateBusinessLocation = z
  .object({
    expectedVersion: BusinessVersion,
    location: BusinessLocationContent,
  })
  .strict();
export const UpdateBusinessLocation = CreateBusinessLocation;
export type UpdateBusinessLocation = CreateBusinessLocation;
export const AssignBusinessCalendar = z
  .object({
    expectedVersion: BusinessVersion,
    locationId: Id.nullable(),
  })
  .strict();
export const UpdateBusinessImages = z
  .object({
    expectedVersion: BusinessVersion,
    images: z
      .array(
        z
          .object({
            id: Id,
            alt: text(BUSINESS_LIMITS.alt).min(1),
            cover: z.boolean(),
          })
          .strict(),
      )
      .max(BUSINESS_LIMITS.images),
  })
  .strict()
  .refine((v) => new Set(v.images.map((i) => i.id)).size === v.images.length, "duplicate_image")
  .refine((v) => v.images.filter((i) => i.cover).length <= 1, "multiple_covers");
export type UpdateBusinessImages = z.infer<typeof UpdateBusinessImages>;

const queryNumber = z
  .union([z.number(), z.string().regex(/^-?[0-9]+(?:\.[0-9]+)?$/)])
  .pipe(z.coerce.number());
const page = {
  limit: queryNumber.pipe(z.number().int().min(1).max(BUSINESS_LIMITS.page)).default(20),
  cursor: z.string().min(1).max(BUSINESS_LIMITS.cursor).optional(),
};
export const BusinessPageQuery = z.object(page).strict();
export const BusinessDirectoryQuery = z
  .object({
    ...page,
    q: text(BUSINESS_LIMITS.query).optional(),
    category: BusinessCategory.optional(),
    country: Country.optional(),
    region: text(BUSINESS_LIMITS.region).optional(),
    locality: text(BUSINESS_LIMITS.locality).min(1).optional(),
    lat: queryNumber.pipe(z.number().min(-90).max(90)).optional(),
    lng: queryNumber.pipe(z.number().min(-180).max(180)).optional(),
    radiusKm: queryNumber.pipe(z.number().min(1).max(100)).optional(),
    sort: z.enum(["name", "distance"]).default("name"),
  })
  .strict()
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), "invalid_location")
  .refine((v) => v.lat !== undefined || (!!v.country && !!v.locality), "location_required")
  .refine(
    (v) => v.lat !== undefined || (v.radiusKm === undefined && v.sort !== "distance"),
    "coordinates_required",
  )
  .refine((v) => v.lat === undefined || (!v.country && !v.region && !v.locality), "ambiguous_location")
  .transform((v) => {
    if (v.lat !== undefined && v.radiusKm === undefined) {
      return { ...v, radiusKm: 10 };
    }
    return v;
  });
export type BusinessDirectoryQuery = z.infer<typeof BusinessDirectoryQuery>;
export type BusinessDirectoryQueryInput = z.input<typeof BusinessDirectoryQuery>;

/** State derived server-side; consumers cannot use this DTO as authorization input. */
export const BusinessAccountCapabilities = z
  .object({
    canCreateBusiness: z.boolean(),
    canManageBusinessProfile: z.boolean(),
    canBook: z.boolean(),
    businessId: Id.nullable(),
  })
  .strict();

/** Projection event ordered by aggregate revision, never by delivery time. */
export const BusinessCalendarProjectionEvent = z
  .object({
    eventId: Id,
    schemaVersion: z.literal(1),
    aggregateVersion: BusinessVersion,
    occurredAt: z.iso.datetime(),
    businessId: Id,
    calendarId: Id,
    state: z.enum(["active", "archived", "deleted"]),
    slug: z.string().min(1).max(255),
    hasActiveServices: z.boolean(),
  })
  .strict();

export const BusinessImage = z
  .object({
    id: Id,
    alt: text(BUSINESS_LIMITS.alt).min(1),
    cover: z.boolean(),
    url: BusinessResourceUrl,
  })
  .strict();
export const BusinessBookingTarget = z
  .object({
    calendarId: Id,
    locationId: Id,
    slug: z.string().min(1).max(255),
    bookingUrl: BusinessResourceUrl,
    reservable: z.boolean(),
  })
  .strict();
/** Public location explicitly omits private street/coordinates in locality-only mode. */
export const PublicBusinessLocation = z.discriminatedUnion("addressVisibility", [
  z
    .object({
      id: Id,
      name: text(BUSINESS_LIMITS.locationName).min(1),
      country: Country,
      region: text(BUSINESS_LIMITS.region),
      locality: text(BUSINESS_LIMITS.locality).min(1),
      addressVisibility: z.literal("locality"),
    })
    .strict(),
  z
    .object({
      id: Id,
      name: text(BUSINESS_LIMITS.locationName).min(1),
      country: Country,
      region: text(BUSINESS_LIMITS.region),
      locality: text(BUSINESS_LIMITS.locality).min(1),
      addressVisibility: z.literal("public"),
      address: text(BUSINESS_LIMITS.address),
      postalCode: text(BUSINESS_LIMITS.postalCode),
      latitude: z.number().min(-90).max(90).nullable(),
      longitude: z.number().min(-180).max(180).nullable(),
    })
    .strict()
    .refine((v) => (v.latitude === null) === (v.longitude === null), "invalid_location"),
]);
export const PublicBusinessSummary = z
  .object({
    businessId: Id,
    displayName: text(BUSINESS_LIMITS.displayName).min(1),
    primaryCategory: BusinessCategory,
    summary: text(255, true),
    cover: BusinessImage.nullable(),
    location: PublicBusinessLocation,
    profileUrl: BusinessResourceUrl,
    bookingTargets: z.array(BusinessBookingTarget).max(10),
    distanceKm: z.number().min(0).nullable(),
  })
  .strict();
export const BusinessDirectoryPage = z
  .object({
    items: z.array(PublicBusinessSummary).max(BUSINESS_LIMITS.page),
    nextCursor: z.string().min(1).max(BUSINESS_LIMITS.cursor).nullable(),
  })
  .strict();
export const PublicBusinessProfile = z
  .object({
    businessId: Id,
    displayName: profileFields.displayName,
    description: profileFields.description,
    primaryCategory: BusinessCategory,
    secondaryCategories: categories,
    websiteUrl: BusinessUrl.nullable(),
    termsUrl: BusinessUrl.nullable(),
    socialLinks,
    locations: z.array(PublicBusinessLocation).max(BUSINESS_LIMITS.locations),
    images: z.array(BusinessImage).max(BUSINESS_LIMITS.images),
    bookingTargets: z.array(BusinessBookingTarget).max(10),
    services: z
      .array(
        z
          .object({
            calendarId: Id,
            serviceId: Id,
            name: text(120).min(1),
            description: text(5000, true),
            durationMinutes: z.number().int().min(1).max(1440),
          })
          .strict(),
      )
      .max(100),
    nextServicesCursor: z.string().min(1).max(BUSINESS_LIMITS.cursor).nullable(),
    reservable: z.boolean(),
  })
  .strict();
export const PrivateBusinessProfile = z
  .object({
    businessId: Id,
    version: BusinessVersion,
    status: BusinessStatus,
    content: BusinessProfileContent,
    requirements: z
      .array(
        z.enum([
          "display_name",
          "description",
          "primary_category",
          "location",
          "active_calendar",
          "active_service",
        ]),
      )
      .max(6),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type PrivateBusinessProfile = z.infer<typeof PrivateBusinessProfile>;

export const PrivateLocation = z
  .object({
    id: Id,
    version: BusinessVersion,
    location: BusinessLocationContent,
  })
  .strict();
export type PrivateLocation = z.infer<typeof PrivateLocation>;

export const LocationPage = z
  .object({
    items: z.array(PrivateLocation).max(BUSINESS_LIMITS.locations),
    nextCursor: z.string().min(1).max(BUSINESS_LIMITS.cursor).nullable(),
  })
  .strict();
export type LocationPage = z.infer<typeof LocationPage>;

export type BusinessAccountCapabilities = z.infer<typeof BusinessAccountCapabilities>;
export type BusinessCategory = z.infer<typeof BusinessCategory>;
export type BusinessPageQuery = z.infer<typeof BusinessPageQuery>;
export type BusinessDirectoryPage = z.infer<typeof BusinessDirectoryPage>;
export type PublicBusinessProfile = z.infer<typeof PublicBusinessProfile>;
export type PublicBusinessSummary = z.infer<typeof PublicBusinessSummary>;
export type PublicBusinessLocation = z.infer<typeof PublicBusinessLocation>;
export type BusinessLocationContent = z.infer<typeof BusinessLocationContent>;
export type CreateBusinessLocation = z.infer<typeof CreateBusinessLocation>;
export type ChangeBusinessPublication = z.infer<typeof ChangeBusinessPublication>;
export type AssignBusinessCalendar = z.infer<typeof AssignBusinessCalendar>;
export const BusinessLocalitiesQuery = z
  .object({
    ...page,
    country: Country,
    region: text(BUSINESS_LIMITS.region).optional(),
    q: text(BUSINESS_LIMITS.query).min(1),
  })
  .strict();
export type BusinessLocalitiesQuery = z.infer<typeof BusinessLocalitiesQuery>;

export const CategoryItem = z
  .object({
    code: BusinessCategory,
    label: text(150),
  })
  .strict();
export type CategoryItem = z.infer<typeof CategoryItem>;

export const CategoryPage = z
  .object({
    items: z.array(CategoryItem).max(100),
    nextCursor: z.string().min(1).max(BUSINESS_LIMITS.cursor).nullable(),
  })
  .strict();
export type CategoryPage = z.infer<typeof CategoryPage>;

export const LocalityItem = z
  .object({
    country: Country,
    region: text(BUSINESS_LIMITS.region),
    locality: text(BUSINESS_LIMITS.locality),
  })
  .strict();
export type LocalityItem = z.infer<typeof LocalityItem>;

export const LocalityPage = z
  .object({
    items: z.array(LocalityItem).max(100),
    nextCursor: z.string().min(1).max(BUSINESS_LIMITS.cursor).nullable(),
  })
  .strict();
export type LocalityPage = z.infer<typeof LocalityPage>;
