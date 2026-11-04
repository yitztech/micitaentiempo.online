import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import { type StorageBackend, StorageQuotaExceededError } from "./storage.ts";

const KEY_NAME = "offline_database_key_v1";
let database: Promise<SQLite.SQLiteDatabase> | undefined;

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync("mcet-offline-v1.db");
  const cipher = await db.getFirstAsync<{ cipher_version: string }>("PRAGMA cipher_version");
  if (!cipher?.cipher_version) throw new Error("SQLCipher is unavailable in this build");
  let key = await SecureStore.getItemAsync(KEY_NAME);
  if (!key) {
    const bytes = await Crypto.getRandomBytesAsync(32);
    key = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    await SecureStore.setItemAsync(KEY_NAME, key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error("Invalid offline database key");
  await db.execAsync(`PRAGMA key = "x'${key}'"`);
  await db.execAsync(
    "CREATE TABLE IF NOT EXISTS offline_items (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)",
  );
  return db;
}

function getDatabase() {
  database ??= openDatabase().catch((error: unknown) => {
    database = undefined;
    throw error;
  });
  return database;
}

export const nativeStorageBackend: StorageBackend = {
  async get(key) {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM offline_items WHERE key = ?",
      key,
    );
    return row?.value ?? null;
  },
  async set(key, value, maxBytes) {
    const db = await getDatabase();
    await db.withExclusiveTransactionAsync(async (tx) => {
      const row = await tx.getFirstAsync<{ bytes: number }>(
        "SELECT COALESCE(SUM(length(CAST(value AS BLOB))), 0) + length(CAST(? AS BLOB)) AS bytes FROM offline_items WHERE key != ?",
        value,
        key,
      );
      if ((row?.bytes ?? 0) > maxBytes) throw new StorageQuotaExceededError();
      await tx.runAsync(
        "INSERT INTO offline_items (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        key,
        value,
      );
    });
  },
  async remove(key) {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM offline_items WHERE key = ?", key);
  },
  async removePrefix(prefix) {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM offline_items WHERE substr(key, 1, length(?)) = ?", prefix, prefix);
  },
};
