import { OFFLINE_LIMITS, OfflineOperationMetadata } from "../../../packages/schemas/dist/index.js";
import type { createMobileClient } from "./index.ts";
import { isTransportError } from "./request-errors.ts";
import {
  AccountClosedError,
  type EncryptedStorage,
  type OfflineQueuedOperation,
  StorageQuotaExceededError,
} from "./storage.ts";

export interface SyncEngineOptions {
  client: ReturnType<typeof createMobileClient>;
  storage: EncryptedStorage;
  accountId: string;
  createOperationId?: () => string;
}

export interface SyncResult {
  /** La sincronización se detuvo antes de terminar: salida de la cuenta o cambio de sesión. */
  interruptedBy?: "exit" | "session_changed";
  total: number;
  synced: number;
  conflicts: number;
  failed: number;
  expired: number;
  pending: number;
  authRequired: boolean;
}

/**
 * Espera a la sincronización en vuelo de una cuenta (si la hay). Nunca rechaza: un fallo de esa sincronización no
 * debe impedir cerrar la sesión. `timeoutMs` acota la espera; devuelve `false` si venció.
 */
export async function awaitActiveSync(storage: EncryptedStorage, accountId: string, timeoutMs = 20_000) {
  const running = activeSyncs.get(storage.syncLockScope)?.get(`${storage.syncLockNamespace}::${accountId}`);
  if (!running) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([running.then(() => true as const).catch(() => true as const), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Resultado de consultar al servidor qué pasó con una operación cuyo envío quedó incierto. */
type Reconciled =
  | { outcome: "synced"; receipt: unknown }
  | { outcome: "conflict" | "failed"; error: string }
  | { outcome: "gone" }
  | { outcome: "absent" }
  | { outcome: "retry"; authRequired: boolean };

export type PullStatus =
  | "up_to_date"
  | "interrupted"
  | "auth_required"
  | "offline"
  | "storage_error"
  | "failed";

export interface PullResult {
  status: PullStatus;
  pages: number;
  /** Elementos nuevos aplicados (los repetidos no cuentan). */
  applied: number;
  /** Veces que hubo que empezar un snapshot por cursor inválido o vencido. */
  restarts: number;
  interruptedBy?: "exit" | "session_changed";
}

const activePulls = new WeakMap<object, Map<string, Promise<PullResult>>>();

const activeSyncs = new WeakMap<object, Map<string, Promise<SyncResult>>>();

/**
 * Motor de sincronización offline con cola durable, idempotencia garantizada,
 * reconciliación de recibos tras respuesta perdida y resolución de conflictos sin sobrescritura silenciosa.
 */
export function createSyncEngine(options: SyncEngineOptions) {
  const { client, storage, accountId } = options;

  /**
   * Reconcilia una operación ya enviada (o reintentada) cuyo resultado se desconoce, sin volver a mutar.
   * - Operaciones con recibo durable (perfil, sedes): consulta `GET /api/offline/operations/:id`.
   * - `booking.cancel` no guarda recibo en el servidor: se reconcilia por estado. `GET /my/bookings?includePast=true`
   *   no incluye las citas canceladas, así que una cita ausente o cancelada significa que la cancelación se aplicó.
   * Un recibo con error no se convierte en éxito: 409 → conflicto; 403/422 → fallo; 5xx no es concluyente.
   */
  async function reconcile(op: OfflineQueuedOperation): Promise<Reconciled> {
    if (op.kind === "booking.cancel") {
      try {
        const list = await client.myBookings(true);
        const found = list.find((b) => b.id === op.resourceId);
        if (!found || found.status === "cancelled") {
          return { outcome: "synced", receipt: { reconciled: found ? "cancelled" : "absent_from_bookings" } };
        }
        return { outcome: "absent" };
      } catch (err: unknown) {
        return { outcome: "retry", authRequired: (err as { status?: number }).status === 401 };
      }
    }
    try {
      const receipt = await client.getOperationReceipt(op.operationId);
      if (!receipt) return { outcome: "absent" };
      if (receipt.status >= 200 && receipt.status < 300) return { outcome: "synced", receipt: receipt.body };
      if (receipt.status === 409) return { outcome: "conflict", error: "profile_conflict" };
      if (receipt.status === 403) return { outcome: "failed", error: "permission_denied" };
      if (receipt.status === 422) return { outcome: "failed", error: "validation_failed" };
      if (receipt.status >= 500) return { outcome: "absent" };
      return { outcome: "failed", error: `receipt_error_${receipt.status}` };
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) return { outcome: "absent" };
      if (status === 410) return { outcome: "gone" };
      return { outcome: "retry", authRequired: status === 401 };
    }
  }

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
      attempted = false,
    }: {
      kind: OfflineQueuedOperation["kind"];
      resourceId: string;
      businessId?: string | null;
      baseVersion?: number | null;
      dependsOn?: string[];
      payload: Record<string, unknown>;
      environment?: "development" | "test" | "production";
      customOperationId?: string;
      /** Ya se intentó enviar y el resultado se desconoce: cuenta como reintento para reconciliarla antes de caducar. */
      attempted?: boolean;
    }): Promise<OfflineQueuedOperation> {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + OFFLINE_LIMITS.sendWithinHours * 3600 * 1000);
      const operationId = customOperationId ?? options.createOperationId?.() ?? crypto.randomUUID();

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
        retryCount: attempted ? 1 : 0,
        lastError: attempted ? "network_or_server_error" : null,
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
        // El plazo impide nuevos envíos; una operación ya intentada (retryCount > 0) debe reconciliarse antes.
        if (op.state === "pending" && op.retryCount === 0 && now > Date.parse(op.expiresAt)) {
          op.state = "expired";
          await storage.updateOperation(accountId, op.operationId, { state: "expired" });
        }
      }
      return queue;
    },

    sync(): Promise<SyncResult> {
      let active = activeSyncs.get(storage.syncLockScope);
      if (!active) {
        active = new Map();
        activeSyncs.set(storage.syncLockScope, active);
      }
      const lockKey = `${storage.syncLockNamespace}::${accountId}`;
      const existing = active.get(lockKey);
      if (existing) return existing;
      const accountSyncs = active;
      const run = (async (): Promise<SyncResult> => {
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
        const states = new Map(queue.map((op) => [op.operationId, op.state]));
        const blockedResources = new Set<string>();
        // La sincronización pertenece a la sesión con la que empezó: si la cuenta se cierra o el cliente pasa a otro
        // token, se detiene sin enviar la cola de esta cuenta con credenciales ajenas.
        const startToken = client.getToken?.();
        const interruption = (): SyncResult["interruptedBy"] => {
          if (storage.accountState(accountId) !== "open") return "exit";
          if (client.getToken?.() !== startToken) return "session_changed";
          return undefined;
        };
        const stopAt = (index: number, reason: NonNullable<SyncResult["interruptedBy"]>) => {
          result.interruptedBy = reason;
          result.pending += queue.slice(index).filter((o) => states.get(o.operationId) !== "synced").length;
        };

        for (const [index, op] of queue.entries()) {
          if (op.state === "synced") {
            result.synced++;
            continue;
          }
          const stopped = interruption();
          if (stopped) {
            stopAt(index, stopped);
            break;
          }
          // 1. Caducidad: impide NUEVOS envíos. Una operación ya enviada (`sending`) o reintentada tiene un resultado
          //    incierto: se reconcilia antes de declararla caducada, porque el servidor pudo haberla completado.
          const expired = now > Date.parse(op.expiresAt);
          const uncertain =
            (op.state === "sending" || op.state === "pending" || op.state === "authentication_required") &&
            (op.state === "sending" || op.retryCount > 0);
          if (expired && !uncertain) {
            if (op.state !== "expired") {
              await storage.updateOperation(accountId, op.operationId, { state: "expired" });
            }
            states.set(op.operationId, "expired");
            blockedResources.add(op.resourceId);
            result.expired++;
            continue;
          }

          // 3. Conflictos existentes: no se reenvían sin resolución del usuario
          if (op.state === "conflict") {
            blockedResources.add(op.resourceId);
            result.conflicts++;
            continue;
          }

          // 4. Operaciones fallidas por validación
          if (op.state === "failed") {
            blockedResources.add(op.resourceId);
            result.failed++;
            continue;
          }

          if (op.state === "expired") {
            blockedResources.add(op.resourceId);
            result.expired++;
            continue;
          }

          // Una operación incierta se reconcilia aunque dependa de otra pendiente: la consulta no muta nada.
          if (!uncertain) {
            if (
              blockedResources.has(op.resourceId) ||
              op.dependsOn.some((id) => states.get(id) !== "synced")
            ) {
              blockedResources.add(op.resourceId);
              result.pending++;
              continue;
            }
          }

          // 5. Reconciliación si hubo envío previo: verificar si el servidor ya lo procesó tras timeout o respuesta perdida
          if (uncertain) {
            const found = await reconcile(op);
            // Una consulta hecha mientras cambiaba la sesión no es fiable para esta cuenta: se descarta.
            const stoppedMid = interruption();
            if (stoppedMid) {
              stopAt(index, stoppedMid);
              break;
            }
            if (found.outcome === "retry") {
              // Sigue la incertidumbre: se conserva la operación tal cual para volver a consultar.
              result.pending++;
              if (found.authRequired) result.authRequired = true;
              break;
            }
            if (found.outcome === "synced") {
              await storage.updateOperation(accountId, op.operationId, {
                state: "synced",
                serverReceipt: found.receipt,
                lastError: null,
              });
              result.synced++;
              states.set(op.operationId, "synced");
              continue;
            }
            if (found.outcome === "conflict" || found.outcome === "failed") {
              await storage.updateOperation(accountId, op.operationId, {
                state: found.outcome,
                lastError: found.error,
              });
              if (found.outcome === "conflict") result.conflicts++;
              else result.failed++;
              states.set(op.operationId, found.outcome);
              blockedResources.add(op.resourceId);
              continue;
            }
            if (found.outcome === "gone" || expired) {
              // 410: el servidor ya no guarda el recibo, el resultado es desconocido y no se reenvía.
              // Sin recibo y fuera de plazo: no se aplicó, y tampoco se envía ya.
              await storage.updateOperation(accountId, op.operationId, {
                state: "expired",
                lastError: found.outcome === "gone" ? "outcome_unknown" : "expired_unsent",
              });
              result.expired++;
              states.set(op.operationId, "expired");
              blockedResources.add(op.resourceId);
              continue;
            }
            // Sin recibo y dentro de plazo: no se aplicó. Se reenvía con la misma clave de idempotencia.
            if (
              blockedResources.has(op.resourceId) ||
              op.dependsOn.some((id) => states.get(id) !== "synced")
            ) {
              blockedResources.add(op.resourceId);
              result.pending++;
              continue;
            }
          }

          // 6. Enviar operación con Idempotency-Key
          const stoppedBeforeSend = interruption();
          if (stoppedBeforeSend) {
            stopAt(index, stoppedBeforeSend);
            break;
          }
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
            states.set(op.operationId, "synced");
          } catch (err: unknown) {
            const errObj = err as { status?: number; code?: string; body?: unknown };

            if (errObj.status === 409) {
              // Conflicto de versión u horario ocupado (ADR 0019 §116)
              await storage.updateOperation(accountId, op.operationId, {
                state: "conflict",
                lastError: "profile_conflict",
              });
              result.conflicts++;
              states.set(op.operationId, "conflict");
              blockedResources.add(op.resourceId);
            } else if (errObj.status === 401) {
              // Sesión caducada: pausar cola y exigir reautenticación
              await storage.updateOperation(accountId, op.operationId, {
                state: "authentication_required",
              });
              result.authRequired = true;
              result.pending++;
              break; // Detener el ciclo hasta que el usuario inicie sesión
            } else if (errObj.status === 403 || errObj.status === 422) {
              // Validación fallida en servidor
              await storage.updateOperation(accountId, op.operationId, {
                state: "failed",
                lastError: errObj.status === 403 ? "permission_denied" : "validation_failed",
              });
              result.failed++;
              states.set(op.operationId, "failed");
              blockedResources.add(op.resourceId);
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
      })();
      const tracked = run.finally(() => accountSyncs.delete(lockKey));
      active.set(lockKey, tracked);
      return tracked;
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

    /**
     * Descarga incremental (ADR 0020): pide páginas hasta quedar al día y aplica cada una de forma atómica con su
     * cursor. Un cursor vencido o inválido reinicia con un snapshot una sola vez, sin tocar la cola. Se detiene sin
     * aplicar nada si la cuenta se cierra o cambia la sesión, y no avanza el cursor si el almacenamiento falla.
     */
    pull({ maxPages = 200 }: { maxPages?: number } = {}): Promise<PullResult> {
      let active = activePulls.get(storage.syncLockScope);
      if (!active) {
        active = new Map();
        activePulls.set(storage.syncLockScope, active);
      }
      const lockKey = `${storage.syncLockNamespace}::${accountId}`;
      const existing = active.get(lockKey);
      if (existing) return existing;
      const pulls = active;
      const run = (async (): Promise<PullResult> => {
        const result: PullResult = { status: "up_to_date", pages: 0, applied: 0, restarts: 0 };
        const startToken = client.getToken?.();
        const interruption = (): PullResult["interruptedBy"] => {
          if (storage.accountState(accountId) !== "open") return "exit";
          if (client.getToken?.() !== startToken) return "session_changed";
          return undefined;
        };
        while (result.pages < maxPages) {
          let stopped = interruption();
          if (stopped) return { ...result, status: "interrupted", interruptedBy: stopped };
          const cursor = (await storage.loadSyncCursor(accountId))?.cursor;
          let page: Awaited<ReturnType<typeof client.getOfflineChanges>>;
          try {
            page = await client.getOfflineChanges(cursor ? { cursor } : {});
          } catch (error: unknown) {
            const { status, code } = error as { status?: number; code?: string };
            if (status === 410 || (status === 400 && code === "invalid_cursor")) {
              if (result.restarts >= 1) return { ...result, status: "failed" };
              result.restarts++;
              try {
                await storage.clearSyncCursor(accountId);
              } catch (clearError) {
                if (clearError instanceof AccountClosedError) {
                  return { ...result, status: "interrupted", interruptedBy: "exit" };
                }
                return { ...result, status: "storage_error" };
              }
              continue;
            }
            if (status === 401) return { ...result, status: "auth_required" };
            if (isTransportError(error)) return { ...result, status: "offline" };
            return { ...result, status: "failed" };
          }
          // Una página pedida mientras cambiaba la sesión no pertenece a esta cuenta: se descarta.
          stopped = interruption();
          if (stopped) return { ...result, status: "interrupted", interruptedBy: stopped };
          try {
            const applied = await storage.applyChangesPage(accountId, page);
            result.applied += applied.applied;
          } catch (error: unknown) {
            if (error instanceof AccountClosedError) {
              return { ...result, status: "interrupted", interruptedBy: "exit" };
            }
            if (error instanceof StorageQuotaExceededError) return { ...result, status: "storage_error" };
            return { ...result, status: "failed" };
          }
          result.pages++;
          if (!page.hasMore) return result;
        }
        return { ...result, status: "failed" };
      })();
      const tracked = run.finally(() => pulls.delete(lockKey));
      active.set(lockKey, tracked);
      return tracked;
    },
  };
}
