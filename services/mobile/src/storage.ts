import { OFFLINE_LIMITS } from "../../../packages/schemas/dist/index.js";
import type { MobileAuthSession } from "./index.ts";

export class StorageQuotaExceededError extends Error {
  code = "storage_quota_exceeded";
  constructor(message = "Espacio de almacenamiento local lleno") {
    super(message);
    this.name = "StorageQuotaExceededError";
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
}

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

  // Almacén cifrado en memoria persistente por instancia de app
  const rawStore = new Map<string, EncryptedPayload>();

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
    const key = buildStorageKey(scope, itemKey);
    const cryptoKey = await deriveAesKey(`${baseUrl}::${environment}::${scope}`, deviceSecret);
    const envelope: CachedEnvelope<T> = {
      data,
      cachedAt: new Date().toISOString(),
    };
    const jsonStr = JSON.stringify(envelope);
    checkQuota(jsonStr.length);
    const encrypted = await encryptData(envelope, cryptoKey);
    rawStore.set(key, encrypted);
  }

  async function getItem<T>(
    scope: string,
    itemKey: string,
    maxHours = OFFLINE_LIMITS.privateAccessHours,
  ): Promise<{ data: T; cachedAt: string; ageMinutes: number; isStale: boolean } | null> {
    const key = buildStorageKey(scope, itemKey);
    const encrypted = rawStore.get(key);
    if (!encrypted) return null;
    try {
      const cryptoKey = await deriveAesKey(`${baseUrl}::${environment}::${scope}`, deviceSecret);
      const envelope = await decryptData<CachedEnvelope<T>>(encrypted, cryptoKey);
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
    } catch {
      return null;
    }
  }

  function removeItem(scope: string, itemKey: string): void {
    const key = buildStorageKey(scope, itemKey);
    rawStore.delete(key);
  }

  return {
    setSimulatedDiskFull(full: boolean) {
      simulatedDiskFull = full;
    },
    setMaxStorageBytes(limit: number) {
      maxBytes = limit;
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
    clearSession(): void {
      removeItem("auth", "session");
    },

    // 2. Citas / Agenda descargadas (aisladas por accountId)
    async saveBookings(accountId: string, bookings: unknown[]): Promise<void> {
      if (bookings.length > OFFLINE_LIMITS.records) {
        throw new StorageQuotaExceededError("Límite de registros de citas excedido.");
      }
      await setItem(`account_${accountId}`, "bookings", bookings);
    },
    async loadBookings(accountId: string) {
      return getItem<unknown[]>(`account_${accountId}`, "bookings", OFFLINE_LIMITS.privateAccessHours);
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
      );
      return res?.data ?? [];
    },
    async enqueueOperation(accountId: string, op: OfflineQueuedOperation): Promise<void> {
      const queue = await this.getQueue(accountId);
      if (queue.length >= OFFLINE_LIMITS.queuedOperations) {
        throw new StorageQuotaExceededError(
          `No se pueden encolar más de ${OFFLINE_LIMITS.queuedOperations} operaciones pendientes.`,
        );
      }
      queue.push(op);
      await setItem(`account_${accountId}`, "offline_queue", queue);
    },
    async updateOperation(
      accountId: string,
      operationId: string,
      updates: Partial<OfflineQueuedOperation>,
    ): Promise<void> {
      const queue = await this.getQueue(accountId);
      const idx = queue.findIndex((o) => o.operationId === operationId);
      const current = queue[idx];
      if (current) {
        queue[idx] = { ...current, ...updates };
        await setItem(`account_${accountId}`, "offline_queue", queue);
      }
    },
    async removeOperation(accountId: string, operationId: string): Promise<void> {
      const queue = await this.getQueue(accountId);
      const filtered = queue.filter((o) => o.operationId !== operationId);
      await setItem(`account_${accountId}`, "offline_queue", filtered);
    },

    // 7. Aislamiento y purga estricta al cambiar de cuenta o cerrar sesión (ADR 0019 §92)
    async clearAccount(accountId: string): Promise<void> {
      const prefix = `${baseUrl}::${environment}::account_${accountId}::`;
      for (const key of Array.from(rawStore.keys())) {
        if (key.startsWith(prefix)) {
          rawStore.delete(key);
        }
      }
    },
  };
}

export type EncryptedStorage = ReturnType<typeof createEncryptedStorage>;
