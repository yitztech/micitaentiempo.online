import { z } from "zod";
import { BusinessVersion } from "./business.ts";

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
