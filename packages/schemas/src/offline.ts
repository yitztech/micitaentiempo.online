import { z } from "zod";
import { BusinessVersion, PrivateBusinessProfile, PrivateLocation } from "./business.ts";

/** Product bounds to be applied by storage and server, not a claim of implemented offline support. */
export const OFFLINE_LIMITS = {
  privateAccessHours: 24,
  publicCacheHours: 24,
  agendaPastDays: 30,
  agendaFutureDays: 90,
  records: 10000,
  mediaBytes: 50 * 1024 * 1024,
  queuedOperations: 100,
  queuedMediaBytes: 20 * 1024 * 1024,
  sendWithinHours: 24,
  operationReceiptDays: 90,
  pullPage: 100,
  dependencies: 10,
  cursor: 2048,
} as const;
export const OfflineOperationKind = z.enum([
  "profile.update",
  "location.create",
  "location.update",
  "image.upload",
  "booking.request",
  "booking.reschedule",
  "booking.cancel",
]);
export const OfflineOperationState = z.enum([
  "pending",
  "sending",
  "synced",
  "authentication_required",
  "conflict",
  "failed",
  "expired",
]);
/** Metadata only: payload is validated by the operation-specific schema before storage/send. */
export const OfflineOperationMetadata = z
  .object({
    operationId: z.uuid(),
    accountId: z.string().min(1).max(64),
    businessId: z.uuid().nullable(),
    environment: z.enum(["development", "test", "production"]),
    resourceId: z.uuid(),
    kind: OfflineOperationKind,
    baseVersion: BusinessVersion.nullable(),
    dependsOn: z.array(z.uuid()).max(OFFLINE_LIMITS.dependencies),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    state: OfflineOperationState,
  })
  .strict()
  .refine((v) => !v.dependsOn.includes(v.operationId) && new Set(v.dependsOn).size === v.dependsOn.length, {
    message: "invalid_dependencies",
    path: ["dependsOn"],
  })
  .refine(
    (v) => {
      const duration = Date.parse(v.expiresAt) - Date.parse(v.createdAt);
      return duration > 0 && duration <= OFFLINE_LIMITS.sendWithinHours * 3600000;
    },
    { message: "invalid_expiry", path: ["expiresAt"] },
  );
export type OfflineOperationMetadata = z.infer<typeof OfflineOperationMetadata>;
export const OfflineChangesQuery = z
  .object({
    cursor: z.string().min(1).max(OFFLINE_LIMITS.cursor).optional(),
    limit: z.coerce.number().int().min(1).max(OFFLINE_LIMITS.pullPage).default(100),
  })
  .strict();

/** Recursos que `GET /api/offline/changes` sincroniza de verdad (ADR 0020). */
export const OFFLINE_RESOURCES = ["business_profile", "business_location"] as const;
/** Recursos del catálogo offline que todavía NO se sincronizan por este canal: nunca se presentan como «sin cambios». */
export const OFFLINE_UNSUPPORTED = [
  "calendar_locations",
  "images",
  "bookings",
  "agenda",
  "public_profiles",
] as const;
export type OfflineResource = (typeof OFFLINE_RESOURCES)[number];

const Revision = z.number().int().min(1);
const ResourceId = z.string().min(1).max(64);
export const OfflineChangeItem = z.union([
  z
    .object({
      resource: z.literal("business_profile"),
      id: ResourceId,
      op: z.literal("upsert"),
      revision: Revision,
      data: PrivateBusinessProfile,
    })
    .strict(),
  z
    .object({
      resource: z.literal("business_location"),
      id: ResourceId,
      op: z.literal("upsert"),
      revision: Revision,
      data: PrivateLocation,
    })
    .strict(),
  z
    .object({
      resource: z.enum(OFFLINE_RESOURCES),
      id: ResourceId,
      op: z.literal("delete"),
      revision: Revision,
    })
    .strict(),
]);
export type OfflineChangeItem = z.infer<typeof OfflineChangeItem>;

/**
 * Página de `GET /api/offline/changes`. Sin cursor es un snapshot paginado (`mode: "snapshot"`); la primera página
 * lleva `reset: true` y el cliente descarta antes su caché de `resources`. `nextCursor` es siempre una cadena.
 */
export const OfflineChangesPage = z
  .object({
    mode: z.enum(["snapshot", "changes"]),
    reset: z.boolean(),
    /** En snapshot, `true` en la última página; en cambios siempre `true`. */
    snapshotComplete: z.boolean(),
    items: z.array(OfflineChangeItem).max(OFFLINE_LIMITS.pullPage),
    nextCursor: z.string().min(1).max(OFFLINE_LIMITS.cursor),
    hasMore: z.boolean(),
    serverTime: z.iso.datetime(),
    resources: z.array(z.enum(OFFLINE_RESOURCES)),
    unsupported: z.array(z.enum(OFFLINE_UNSUPPORTED)),
  })
  .strict();
export type OfflineChangesPage = z.infer<typeof OfflineChangesPage>;
