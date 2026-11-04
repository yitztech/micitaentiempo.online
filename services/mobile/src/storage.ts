import { OFFLINE_LIMITS } from "../../../packages/schemas/dist/index.js";
import type { MobileAuthSession } from "./index.ts";

export class StorageQuotaExceededError extends Error {
  code = "storage_quota_exceeded";
  constructor(message = "Espacio de almacenamiento local lleno") {
    super(message);
    this.name = "StorageQuotaExceededError";
  }
}

/** La cuenta está cerrada (cierre de sesión o purga): no admite nuevas operaciones hasta volver a abrirse. */
export class AccountClosedError extends Error {
  constructor(message = "La cuenta está cerrada en este dispositivo.") {
    super(message);
    this.name = "AccountClosedError";
  }
}

export interface OfflineQueuedOperation {
  operationId: string;
  accountId: string;
  businessId: string | null;
  environment: "development" | "test" | "production";
  resourceId: string;
  kind:
    | "profile.update"
    | "location.create"
    | "location.update"
    | "image.upload"
    | "booking.request"
    | "booking.reschedule"
    | "booking.cancel";
  baseVersion: number | null;
  dependsOn: string[];
  createdAt: string;
  expiresAt: string;
  state: "pending" | "sending" | "synced" | "authentication_required" | "conflict" | "failed" | "expired";
  payload: Record<string, unknown>;
  retryCount: number;
  lastError?: string | null;
  serverReceipt?: unknown | null;
}

export interface CachedEnvelope<T> {
  data: T;
  cachedAt: string;
}

export interface EncryptedPayload {
  ivHex: string;
  cipherHex: string;
}

/**
 * Deriva una clave AES-GCM a partir de un secreto de dispositivo y ámbito de aislamiento.
 */
async function deriveAesKey(scope: string, deviceSecret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const rawHash = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(`${deviceSecret}::${scope}::mcet-offline-salt-2026`),
  );
  return crypto.subtle.importKey("raw", rawHash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptData<T>(data: T, key: CryptoKey): Promise<EncryptedPayload> {
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(data));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const cipherBytes = new Uint8Array(ciphertextBuffer);

  return {
    ivHex: Array.from(iv, (b) => b.toString(16).padStart(2, "0")).join(""),
    cipherHex: Array.from(cipherBytes, (b) => b.toString(16).padStart(2, "0")).join(""),
  };
}

async function decryptData<T>(payload: EncryptedPayload, key: CryptoKey): Promise<T> {
  const iv = new Uint8Array(payload.ivHex.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
  const cipherBytes = new Uint8Array(
    payload.cipherHex.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
  const decryptedBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBytes);
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(decryptedBuffer)) as T;
}

export interface StorageOptions {
  baseUrl: string;
  environment?: "development" | "test" | "production";
  deviceSecret?: string;
  maxStorageBytes?: number;
  backend?: StorageBackend;
}

export interface StorageBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, maxBytes: number): Promise<void>;
  remove(key: string): Promise<void>;
  removePrefix(prefix: string): Promise<void>;
}

/** Operaciones confirmadas que se conservan como historial (por recibo/trazabilidad) además de las referenciadas. */
export const SYNCED_HISTORY_MAX = 20;

/**
 * Compacta el historial de la cola sin perder nada que haga falta. Solo se retiran operaciones `synced`:
 * `pending`, `sending`, `authentication_required`, `conflict`, `failed` y `expired` (que pueden esconder un
 * resultado incierto o requieren decisión de la persona) nunca se eliminan para liberar espacio. Se conservan,
 * además, las confirmadas de las que dependa alguna operación no confirmada: el sincronizador necesita verlas
 * como `synced` para liberar a sus dependientes.
 */
export function compactQueue(queue: OfflineQueuedOperation[], now = Date.now()): OfflineQueuedOperation[] {
  const needed = new Set(queue.filter((op) => op.state !== "synced").flatMap((op) => op.dependsOn));
  const retentionMs = OFFLINE_LIMITS.operationReceiptDays * 86_400_000;
  const keepRecent = new Set(
    queue
      .filter((op) => op.state === "synced" && now - Date.parse(op.createdAt) <= retentionMs)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, SYNCED_HISTORY_MAX)
      .map((op) => op.operationId),
  );
  return queue.filter(
    (op) => op.state !== "synced" || needed.has(op.operationId) || keepRecent.has(op.operationId),
  );
}

const backendLocks = new WeakMap<StorageBackend, Map<string, Promise<void>>>();

/**
 * Motor de almacenamiento local seguro, cifrado con AES-256-GCM y aislado por
 * servidor (baseUrl), entorno y cuenta (accountId).
 * Aplica los límites de OFFLINE_LIMITS y previene fugas entre cuentas al cerrar sesión.
 */
export function createEncryptedStorage(options: StorageOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const environment = options.environment ?? "production";
  const deviceSecret = options.deviceSecret ?? "mcet-device-seed-default";
  let maxBytes = options.maxStorageBytes ?? OFFLINE_LIMITS.mediaBytes;
  let simulatedDiskFull = false;
  // Barrera de salida por cuenta: "closing" impide nuevos envíos mientras se drena la sincronización en vuelo;
  // "closed" descarta cualquier escritura tardía de esa cuenta hasta que vuelva a iniciar sesión (`openAccount`).
  const accountStates = new Map<string, "closing" | "closed">();
  const accountOf = (scope: string) => (scope.startsWith("account_") ? scope.slice("account_".length) : null);

  // Almacén cifrado en memoria persistente por instancia de app
  const rawStore = new Map<string, EncryptedPayload>();
  const locks = options.backend
    ? (backendLocks.get(options.backend) ?? new Map<string, Promise<void>>())
    : new Map<string, Promise<void>>();
  if (options.backend) backendLocks.set(options.backend, locks);

  async function withAccountLock<T>(accountId: string, action: () => Promise<T>): Promise<T> {
    const lockKey = `${baseUrl}::${environment}::${accountId}`;
    const previous = locks.get(lockKey) ?? Promise.resolve();
    let release = () => {};
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(lockKey, next);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (locks.get(lockKey) === next) locks.delete(lockKey);
    }
  }

  function buildStorageKey(scope: string, itemKey: string): string {
    return `${baseUrl}::${environment}::${scope}::${itemKey}`;
  }

  function checkQuota(newBytes: number) {
    if (simulatedDiskFull) {
      throw new StorageQuotaExceededError("Espacio de almacenamiento local lleno (disco simulado lleno).");
    }
    let currentBytes = 0;
    for (const val of rawStore.values()) {
      currentBytes += (val.cipherHex.length + val.ivHex.length) / 2;
    }
    if (currentBytes + newBytes > maxBytes) {
      throw new StorageQuotaExceededError("Espacio de almacenamiento local lleno (cuota excedida).");
    }
  }

  async function setItem<T>(scope: string, itemKey: string, data: T): Promise<void> {
    const owner = accountOf(scope);
    if (owner && accountStates.get(owner) === "closed") throw new AccountClosedError();
    const key = buildStorageKey(scope, itemKey);
    const envelope: CachedEnvelope<T> = {
      data,
      cachedAt: new Date().toISOString(),
    };
    const jsonStr = JSON.stringify(envelope);
    if (options.backend) {
      if (simulatedDiskFull) throw new StorageQuotaExceededError();
      await options.backend.set(key, jsonStr, maxBytes);
      return;
    }
    const cryptoKey = await deriveAesKey(`${baseUrl}::${environment}::${scope}`, deviceSecret);
    checkQuota(jsonStr.length);
    const encrypted = await encryptData(envelope, cryptoKey);
    rawStore.set(key, encrypted);
  }

  async function getItem<T>(
    scope: string,
    itemKey: string,
    maxHours = OFFLINE_LIMITS.privateAccessHours,
    strict = false,
  ): Promise<{ data: T; cachedAt: string; ageMinutes: number; isStale: boolean } | null> {
    const key = buildStorageKey(scope, itemKey);
    const encrypted = rawStore.get(key);
    const stored = options.backend ? await options.backend.get(key) : null;
    if (!encrypted && stored === null) return null;
    try {
      const envelope =
        stored !== null
          ? (JSON.parse(stored) as CachedEnvelope<T>)
          : encrypted
            ? await decryptData<CachedEnvelope<T>>(
                encrypted,
                await deriveAesKey(`${baseUrl}::${environment}::${scope}`, deviceSecret),
              )
            : null;
      if (!envelope) return null;
      const cachedTime = Date.parse(envelope.cachedAt);
      const now = Date.now();
      const ageMs = Math.max(0, now - cachedTime);
      const ageMinutes = Math.floor(ageMs / 60000);
      const isStale = ageMs > maxHours * 3600 * 1000;
      return {
        data: envelope.data,
        cachedAt: envelope.cachedAt,
        ageMinutes,
        isStale,
      };
    } catch (error) {
      if (strict) throw error;
      return null;
    }
  }

  async function removeItem(scope: string, itemKey: string): Promise<void> {
    const key = buildStorageKey(scope, itemKey);
    if (options.backend) await options.backend.remove(key);
    rawStore.delete(key);
  }

  return {
    syncLockScope: options.backend ?? rawStore,
    syncLockNamespace: `${baseUrl}::${environment}`,
    setSimulatedDiskFull(full: boolean) {
      simulatedDiskFull = full;
    },
    setMaxStorageBytes(limit: number) {
      maxBytes = limit;
    },

    /** Estado de la barrera de salida de una cuenta. */
    accountState(accountId: string): "open" | "closing" | "closed" {
      return accountStates.get(accountId) ?? "open";
    },
    /** Primera fase de la salida: impide nuevos envíos; quien sincroniza debe parar antes de la siguiente operación. */
    beginExit(accountId: string): void {
      if (accountStates.get(accountId) !== "closed") accountStates.set(accountId, "closing");
    },
    /** La cuenta vuelve a admitir datos privados (nuevo inicio de sesión). */
    openAccount(accountId: string): void {
      accountStates.delete(accountId);
    },

    // 1. Sesión de usuario
    async saveSession(session: MobileAuthSession): Promise<void> {
      await setItem("auth", "session", session);
    },
    async loadSession(): Promise<{ session: MobileAuthSession; cachedAt: string; isStale: boolean } | null> {
      const res = await getItem<MobileAuthSession>("auth", "session", OFFLINE_LIMITS.privateAccessHours);
      if (!res) return null;
      return { session: res.data, cachedAt: res.cachedAt, isStale: res.isStale };
    },
    async clearSession(): Promise<void> {
      await removeItem("auth", "session");
    },

    // 2. Citas / Agenda descargadas (aisladas por accountId)
    async saveBookings(accountId: string, bookings: unknown[]): Promise<void> {
      if (accountStates.get(accountId) === "closed") return; // escritura tardía de una cuenta ya cerrada
      if (bookings.length > OFFLINE_LIMITS.records) {
        throw new StorageQuotaExceededError("Límite de registros de citas excedido.");
      }
      await setItem(`account_${accountId}`, "bookings", bookings);
    },
    async loadBookings(accountId: string) {
      return getItem<unknown[]>(`account_${accountId}`, "bookings", OFFLINE_LIMITS.privateAccessHours);
    },
    async saveSummary(accountId: string, summary: unknown): Promise<void> {
      if (accountStates.get(accountId) === "closed") return;
      await setItem(`account_${accountId}`, "summary", summary);
    },
    async loadSummary(accountId: string) {
      return getItem<unknown>(`account_${accountId}`, "summary", OFFLINE_LIMITS.privateAccessHours);
    },

    // 3. Directorio público en caché
    async saveDirectory(data: {
      categories?: unknown[];
      localities?: unknown[];
      businesses?: unknown[];
    }): Promise<void> {
      await setItem("public_directory", "catalog", data);
    },
    async loadDirectory() {
      return getItem<{ categories?: unknown[]; localities?: unknown[]; businesses?: unknown[] }>(
        "public_directory",
        "catalog",
        OFFLINE_LIMITS.publicCacheHours,
      );
    },

    // 4. Perfiles de negocios guardados en caché
    async saveBusinessProfile(id: string, profile: unknown): Promise<void> {
      await setItem("public_profiles", id, profile);
    },
    async loadBusinessProfile(id: string) {
      return getItem<unknown>("public_profiles", id, OFFLINE_LIMITS.publicCacheHours);
    },

    // 5. Perfil de negocio privado del propietario
    async saveOwnerProfile(accountId: string, profile: unknown): Promise<void> {
      if (accountStates.get(accountId) === "closed") return;
      await setItem(`account_${accountId}`, "owner_profile", profile);
    },
    async loadOwnerProfile(accountId: string) {
      return getItem<unknown>(`account_${accountId}`, "owner_profile", OFFLINE_LIMITS.privateAccessHours);
    },

    // 6. Cola durable de operaciones offline (aislada por accountId)
    async getQueue(accountId: string): Promise<OfflineQueuedOperation[]> {
      const res = await getItem<OfflineQueuedOperation[]>(
        `account_${accountId}`,
        "offline_queue",
        OFFLINE_LIMITS.sendWithinHours,
        true,
      );
      return res?.data ?? [];
    },
    async enqueueOperation(accountId: string, op: OfflineQueuedOperation): Promise<void> {
      return withAccountLock(accountId, async () => {
        if (op.accountId !== accountId) throw new Error("Operation account mismatch");
        if (accountStates.has(accountId)) throw new AccountClosedError();
        const queue = await this.getQueue(accountId);
        if (queue.some((item) => item.operationId === op.operationId))
          throw new Error("Duplicate operation ID");
        // La cuota cuenta lo que aún no está confirmado; el historial confirmado no la consume (se compacta aquí).
        if (queue.filter((item) => item.state !== "synced").length >= OFFLINE_LIMITS.queuedOperations) {
          throw new StorageQuotaExceededError(
            `No se pueden encolar más de ${OFFLINE_LIMITS.queuedOperations} operaciones pendientes.`,
          );
        }
        // Compactar y añadir se guardan en una sola escritura: si falla, la cola anterior queda intacta.
        await setItem(`account_${accountId}`, "offline_queue", compactQueue([...queue, op]));
      });
    },
    async updateOperation(
      accountId: string,
      operationId: string,
      updates: Partial<OfflineQueuedOperation>,
    ): Promise<void> {
      return withAccountLock(accountId, async () => {
        if (accountStates.get(accountId) === "closed") return; // respuesta tardía tras la purga: se descarta
        const queue = await this.getQueue(accountId);
        const idx = queue.findIndex((o) => o.operationId === operationId);
        const current = queue[idx];
        if (current) {
          queue[idx] = { ...current, ...updates };
          await setItem(`account_${accountId}`, "offline_queue", queue);
        }
      });
    },
    async removeOperation(accountId: string, operationId: string): Promise<void> {
      return withAccountLock(accountId, async () => {
        if (accountStates.get(accountId) === "closed") return;
        const queue = await this.getQueue(accountId);
        const filtered = queue.filter((o) => o.operationId !== operationId);
        await setItem(`account_${accountId}`, "offline_queue", filtered);
      });
    },

    // 7. Aislamiento y purga estricta al cambiar de cuenta o cerrar sesión (ADR 0019 §92)
    async clearAccount(accountId: string): Promise<void> {
      // Se cierra antes de purgar: ninguna escritura tardía puede recrear datos privados, ni siquiera si la purga falla.
      accountStates.set(accountId, "closed");
      return withAccountLock(accountId, async () => {
        const prefix = `${baseUrl}::${environment}::account_${accountId}::`;
        if (options.backend) await options.backend.removePrefix(prefix);
        for (const key of Array.from(rawStore.keys())) {
          if (key.startsWith(prefix)) {
            rawStore.delete(key);
          }
        }
      });
    },
  };
}

export type EncryptedStorage = ReturnType<typeof createEncryptedStorage>;
