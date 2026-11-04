import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEncryptedStorage, StorageQuotaExceededError } from "../../services/mobile/src/index.ts";
import { createSqliteBackend } from "../../services/mobile/src/sqlite-backend.ts";

/**
 * Conexión de `expo-sqlite` sobre SQLite real. Solo se simula la frontera: cada llamada cede el turno como el puente
 * nativo, `withTransactionAsync` hace BEGIN/COMMIT/ROLLBACK en la misma conexión y, como en SQLCipher, una conexión
 * nueva no tiene la clave de `PRAGMA key`.
 */
function connection() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE offline_items (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)");
  const turn = () => new Promise((resolve) => setImmediate(resolve));
  return {
    sqlite,
    async getFirstAsync(source, ...params) {
      await turn();
      return sqlite.prepare(source).get(...params) ?? null;
    },
    async runAsync(source, ...params) {
      await turn();
      return sqlite.prepare(source).run(...params);
    },
    async withTransactionAsync(task) {
      await turn();
      sqlite.exec("BEGIN");
      try {
        await task();
        await turn();
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    async withExclusiveTransactionAsync() {
      throw new Error("file is not a database");
    },
  };
}

const rows = (db) => db.sqlite.prepare("SELECT key FROM offline_items ORDER BY key").all();

describe("backend SQLite de la app (una conexión con clave)", () => {
  let db;
  let backend;

  beforeEach(() => {
    db = connection();
    backend = createSqliteBackend(async () => db);
  });

  it("escribe y lee sin abrir una conexión sin clave de SQLCipher", async () => {
    const exclusive = vi.spyOn(db, "withExclusiveTransactionAsync");
    await backend.set("a", "uno", 1000);
    await backend.transaction([{ type: "set", key: "b", value: "dos" }], 1000);
    expect(await backend.get("a")).toBe("uno");
    expect(await backend.get("b")).toBe("dos");
    expect(exclusive).not.toHaveBeenCalled();
  });

  it("superar la cuota total revierte toda la transacción", async () => {
    await backend.set("a", "uno", 1000);
    await expect(
      backend.transaction(
        [
          { type: "remove", key: "a" },
          { type: "set", key: "b", value: "x".repeat(50) },
        ],
        10,
      ),
    ).rejects.toBeInstanceOf(StorageQuotaExceededError);
    expect(rows(db)).toEqual([{ key: "a" }]);
  });

  it("set respeta la cuota y sustituir una clave no cuenta su valor anterior", async () => {
    await backend.set("a", "x".repeat(8), 10);
    await backend.set("a", "y".repeat(10), 10);
    await expect(backend.set("b", "z", 10)).rejects.toBeInstanceOf(StorageQuotaExceededError);
    expect(await backend.get("a")).toBe("y".repeat(10));
  });

  it("las operaciones simultáneas no se mezclan con una transacción abierta", async () => {
    const seen = [];
    await Promise.all([
      backend.transaction(
        [
          { type: "set", key: "a", value: "1" },
          { type: "set", key: "b", value: "1" },
        ],
        1000,
      ),
      backend.get("b").then((value) => seen.push(value)),
      backend.set("c", "1", 1000),
      backend.transaction([{ type: "set", key: "d", value: "1" }], 1000),
      backend.remove("a"),
    ]);
    expect(seen).toEqual(["1"]);
    expect(rows(db)).toEqual([{ key: "b" }, { key: "c" }, { key: "d" }]);
  });

  it("una operación fallida no bloquea las siguientes y removePrefix borra solo su prefijo", async () => {
    await expect(backend.set("a", "x".repeat(50), 10)).rejects.toBeInstanceOf(StorageQuotaExceededError);
    await backend.set("cuenta::a", "1", 1000);
    await backend.set("cuenta::b", "1", 1000);
    await backend.set("otra::a", "1", 1000);
    await backend.removePrefix("cuenta::");
    expect(rows(db)).toEqual([{ key: "otra::a" }]);
  });

  it("guarda la cola y aplica una página completa a través del almacenamiento real", async () => {
    const storage = createEncryptedStorage({ baseUrl: "https://x.test", environment: "test", backend });
    await storage.saveBookings("user-a", [{ id: "uno" }]);
    await storage.applyChangesPage("user-a", {
      mode: "snapshot",
      reset: true,
      snapshotComplete: true,
      hasMore: false,
      nextCursor: "cursor-1",
      serverTime: new Date().toISOString(),
      resources: [],
      unsupported: [],
      items: [],
    });
    expect((await storage.loadBookings("user-a"))?.data).toEqual([{ id: "uno" }]);
    expect((await storage.loadSyncCursor("user-a"))?.cursor).toBe("cursor-1");
  });
});
