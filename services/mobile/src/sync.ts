import { OFFLINE_LIMITS, OfflineOperationMetadata } from "../../../packages/schemas/dist/index.js";
import type { createMobileClient } from "./index.ts";
import type { EncryptedStorage, OfflineQueuedOperation } from "./storage.ts";

export interface SyncEngineOptions {
  client: ReturnType<typeof createMobileClient>;
  storage: EncryptedStorage;
  accountId: string;
}

export interface SyncResult {
  total: number;
  synced: number;
  conflicts: number;
  failed: number;
  expired: number;
  pending: number;
  authRequired: boolean;
}

/**
 * Motor de sincronización offline con cola durable, idempotencia garantizada,
 * reconciliación de recibos tras respuesta perdida y resolución de conflictos sin sobrescritura silenciosa.
 */
export function createSyncEngine(options: SyncEngineOptions) {
  const { client, storage, accountId } = options;

  return {
    async enqueue({
      kind,
      resourceId,
      businessId = null,
      baseVersion = null,
      dependsOn = [],
      payload,
      environment = "production",
      customOperationId,
    }: {
      kind: OfflineQueuedOperation["kind"];
      resourceId: string;
      businessId?: string | null;
      baseVersion?: number | null;
      dependsOn?: string[];
      payload: Record<string, unknown>;
      environment?: "development" | "test" | "production";
      customOperationId?: string;
    }): Promise<OfflineQueuedOperation> {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + OFFLINE_LIMITS.sendWithinHours * 3600 * 1000);
      const operationId = customOperationId ?? crypto.randomUUID();

      const op: OfflineQueuedOperation = {
        operationId,
        accountId,
        businessId,
        environment,
        resourceId,
        kind,
        baseVersion,
        dependsOn,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        state: "pending",
        payload,
        retryCount: 0,
        lastError: null,
      };

      // Valida metadatos según esquema formal del contrato
      OfflineOperationMetadata.parse({
        operationId: op.operationId,
        accountId: op.accountId,
        businessId: op.businessId,
        environment: op.environment,
        resourceId: op.resourceId,
        kind: op.kind,
        baseVersion: op.baseVersion,
        dependsOn: op.dependsOn,
        createdAt: op.createdAt,
        expiresAt: op.expiresAt,
        state: op.state,
      });

      await storage.enqueueOperation(accountId, op);
      return op;
    },

    async getPendingOperations(): Promise<OfflineQueuedOperation[]> {
      const queue = await storage.getQueue(accountId);
      const now = Date.now();
      for (const op of queue) {
        if (op.state === "pending" && now > Date.parse(op.expiresAt)) {
          op.state = "expired";
          await storage.updateOperation(accountId, op.operationId, { state: "expired" });
        }
      }
      return queue;
    },

    async sync(): Promise<SyncResult> {
      const queue = await storage.getQueue(accountId);
      const now = Date.now();
      const result: SyncResult = {
        total: queue.length,
        synced: 0,
        conflicts: 0,
        failed: 0,
        expired: 0,
        pending: 0,
        authRequired: false,
      };

      for (const op of queue) {
        // 1. Verificar caducidad
        if (now > Date.parse(op.expiresAt)) {
          if (op.state !== "expired") {
            await storage.updateOperation(accountId, op.operationId, { state: "expired" });
          }
          result.expired++;
          continue;
        }

        // 2. Operaciones ya sincronizadas
        if (op.state === "synced") {
          result.synced++;
          continue;
        }

        // 3. Conflictos existentes: no se reenvían sin resolución del usuario
        if (op.state === "conflict") {
          result.conflicts++;
          continue;
        }

        // 4. Operaciones fallidas por validación
        if (op.state === "failed") {
          result.failed++;
          continue;
        }

        // 5. Reconciliación RPC si hubo reintento: verificar si el servidor ya lo procesó tras timeout
        if (op.retryCount > 0) {
          try {
            const receipt = await client.getOperationReceipt(op.operationId);
            if (receipt && receipt.status >= 200 && receipt.status < 300) {
              await storage.updateOperation(accountId, op.operationId, {
                state: "synced",
                serverReceipt: receipt.body,
              });
              result.synced++;
              continue;
            }
          } catch (err: unknown) {
            const errObj = err as { status?: number };
            if (errObj.status === 410) {
              await storage.updateOperation(accountId, op.operationId, { state: "expired" });
              result.expired++;
              continue;
            }
          }
        }

        // 6. Enviar operación con Idempotency-Key
        await storage.updateOperation(accountId, op.operationId, { state: "sending" });

        try {
          let serverRes: unknown = null;
          if (op.kind === "profile.update") {
            serverRes = await client.updateOwnerBusinessProfile(
              op.payload as never,
              op.baseVersion ?? 1,
              op.operationId,
            );
          } else if (op.kind === "location.create") {
            serverRes = await client.addBusinessLocation(
              op.payload as never,
              op.baseVersion ?? 1,
              op.operationId,
            );
          } else if (op.kind === "booking.cancel") {
            serverRes = await client.cancelBooking(
              op.resourceId,
              op.payload as { reason?: string },
              op.operationId,
            );
          } else {
            throw new Error(`Tipo de operación no soportado: ${op.kind}`);
          }

          await storage.updateOperation(accountId, op.operationId, {
            state: "synced",
            serverReceipt: serverRes,
            lastError: null,
          });
          result.synced++;
        } catch (err: unknown) {
          const errObj = err as { status?: number; code?: string; body?: unknown };

          if (errObj.status === 409) {
            // Conflicto de versión u horario ocupado (ADR 0019 §116)
            await storage.updateOperation(accountId, op.operationId, {
              state: "conflict",
              lastError: "profile_conflict",
            });
            result.conflicts++;
          } else if (errObj.status === 401) {
            // Sesión caducada: pausar cola y exigir reautenticación
            await storage.updateOperation(accountId, op.operationId, {
              state: "authentication_required",
            });
            result.authRequired = true;
            result.pending++;
            break; // Detener el ciclo hasta que el usuario inicie sesión
          } else if (errObj.status === 422) {
            // Validación fallida en servidor
            await storage.updateOperation(accountId, op.operationId, {
              state: "failed",
              lastError: "validation_failed",
            });
            result.failed++;
          } else {
            // Fallo de red o error de servidor: incrementar reintento y mantener pending
            await storage.updateOperation(accountId, op.operationId, {
              state: "pending",
              retryCount: op.retryCount + 1,
              lastError: "network_or_server_error",
            });
            result.pending++;
            break; // Detener este ciclo con retroceso
          }
        }
      }

      return result;
    },

    async resolveConflict(
      operationId: string,
      resolution: "discard" | "retry_with_version",
      newVersion?: number,
    ): Promise<void> {
      if (resolution === "discard") {
        await storage.removeOperation(accountId, operationId);
      } else if (resolution === "retry_with_version") {
        await storage.updateOperation(accountId, operationId, {
          baseVersion: newVersion ?? null,
          state: "pending",
          retryCount: 0,
          lastError: null,
        });
      }
    },
  };
}
