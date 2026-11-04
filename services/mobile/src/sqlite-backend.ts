import { type StorageBackend, StorageQuotaExceededError } from "./storage.ts";

/** Lo que el backend necesita de la conexión SQLite; en la app es la de `expo-sqlite`, ya abierta con su clave. */
export interface SqliteConnection {
  getFirstAsync<T>(source: string, ...params: string[]): Promise<T | null>;
  runAsync(source: string, ...params: string[]): Promise<unknown>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

const UPSERT =
  "INSERT INTO offline_items (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";

/**
 * Backend sobre UNA sola conexión. `PRAGMA key` de SQLCipher vale solo para la conexión que lo ejecuta, así que no se
 * puede usar `withExclusiveTransactionAsync`: abre otra conexión sin clave y falla con «file is not a database».
 * `withTransactionAsync` no aísla de otras consultas de la misma conexión, por eso todas pasan por esta cola: ninguna
 * se ejecuta en medio de una transacción.
 */
export function createSqliteBackend(getDatabase: () => Promise<SqliteConnection>): StorageBackend {
  let tail: Promise<unknown> = Promise.resolve();
  function serial<T>(task: (db: SqliteConnection) => Promise<T>): Promise<T> {
    const run = tail.then(async () => task(await getDatabase()));
    tail = run.catch(() => undefined);
    return run;
  }

  return {
    get: (key) =>
      serial(async (db) => {
        const row = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM offline_items WHERE key = ?",
          key,
        );
        return row?.value ?? null;
      }),
    set: (key, value, maxBytes) =>
      serial((db) =>
        db.withTransactionAsync(async () => {
          const row = await db.getFirstAsync<{ bytes: number }>(
            "SELECT COALESCE(SUM(length(CAST(value AS BLOB))), 0) + length(CAST(? AS BLOB)) AS bytes FROM offline_items WHERE key != ?",
            value,
            key,
          );
          if ((row?.bytes ?? 0) > maxBytes) throw new StorageQuotaExceededError();
          await db.runAsync(UPSERT, key, value);
        }),
      ),
    // Si algo lanza (incluida la cuota total), la transacción se revierte y no se aplica ninguna operación.
    transaction: (operations, maxBytes) =>
      serial((db) =>
        db.withTransactionAsync(async () => {
          for (const op of operations) {
            if (op.type === "set") await db.runAsync(UPSERT, op.key, op.value);
            else await db.runAsync("DELETE FROM offline_items WHERE key = ?", op.key);
          }
          const total = await db.getFirstAsync<{ bytes: number }>(
            "SELECT COALESCE(SUM(length(CAST(value AS BLOB))), 0) AS bytes FROM offline_items",
          );
          if ((total?.bytes ?? 0) > maxBytes) throw new StorageQuotaExceededError();
        }),
      ),
    remove: (key) =>
      serial(async (db) => {
        await db.runAsync("DELETE FROM offline_items WHERE key = ?", key);
      }),
    removePrefix: (prefix) =>
      serial(async (db) => {
        await db.runAsync("DELETE FROM offline_items WHERE substr(key, 1, length(?)) = ?", prefix, prefix);
      }),
  };
}
