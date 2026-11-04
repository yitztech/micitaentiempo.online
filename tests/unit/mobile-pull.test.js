import { describe, expect, it, vi } from "vitest";
import {
  AccountClosedError,
  createEncryptedStorage,
  createMobileClient,
  createSyncEngine,
  StorageQuotaExceededError,
  signOutAccount,
} from "../../services/mobile/src/index.ts";

const BIZ = "019a0000-0000-7000-8000-0000000d0001";
const loc = (n) => `019a0000-0000-7000-8000-0000000d1${String(n).padStart(3, "0")}`;
const profile = (version, displayName = "Clínica") => ({
  businessId: BIZ,
  version,
  status: "draft",
  content: {
    displayName,
    description: "",
    primaryCategory: null,
    secondaryCategories: [],
    websiteUrl: null,
    termsUrl: null,
    socialLinks: [],
  },
  requirements: [],
  updatedAt: "2026-11-03T12:00:00.000Z",
});
const location = (n, name = `Sede ${n}`, version = 1) => ({
  id: loc(n),
  version,
  location: {
    name,
    country: "ES",
    region: "",
    locality: "Madrid",
    address: "",
    postalCode: "",
    addressVisibility: "locality",
    latitude: null,
    longitude: null,
  },
});
const up = (resource, id, revision, data) => ({ resource, id, op: "upsert", revision, data });
const del = (resource, id, revision) => ({ resource, id, op: "delete", revision });
const page = (overrides) => ({
  mode: "changes",
  reset: false,
  snapshotComplete: true,
  items: [],
  nextCursor: "c.1",
  hasMore: false,
  serverTime: "2026-11-03T12:00:00.000Z",
  resources: ["business_profile", "business_location"],
  unsupported: ["bookings"],
  ...overrides,
});

/** Backend en memoria con transacciones atómicas y fallos inyectables. */
function memoryBackend() {
  const data = new Map();
  const backend = {
    data,
    failTransaction: null,
    setCalls: 0,
    transactions: 0,
    async get(key) {
      return data.get(key) ?? null;
    },
    async set(key, value) {
      backend.setCalls++;
      data.set(key, value);
    },
    async remove(key) {
      data.delete(key);
    },
    async removePrefix(prefix) {
      for (const key of [...data.keys()]) if (key.startsWith(prefix)) data.delete(key);
    },
    async transaction(operations, maxBytes) {
      backend.transactions++;
      if (backend.failTransaction) throw backend.failTransaction;
      const draft = new Map(data);
      for (const op of operations) {
        if (op.type === "set") draft.set(op.key, op.value);
        else draft.delete(op.key);
      }
      let bytes = 0;
      for (const v of draft.values()) bytes += v.length;
      if (bytes > maxBytes) throw new StorageQuotaExceededError();
      data.clear();
      for (const [k, v] of draft) data.set(k, v);
    },
  };
  return backend;
}

function setup(pages = [], options = {}) {
  const backend = memoryBackend();
  const storage = createEncryptedStorage({
    baseUrl: "https://api.micitaentiempo.online",
    environment: "test",
    backend,
    ...options,
  });
  const queue = [...pages];
  const requests = [];
  let token = "token-a";
  const client = {
    getToken: () => token,
    setToken: (t) => {
      token = t;
    },
    signOut: vi.fn(async () => undefined),
    getOfflineChanges: vi.fn(async (params) => {
      requests.push(params);
      const next = queue.shift();
      if (next instanceof Error || (typeof next?.status === "number" && !next.items)) throw next;
      return next ?? page({});
    }),
    updateOwnerBusinessProfile: vi.fn(async () => profile(9)),
    getOperationReceipt: vi.fn(),
  };
  return {
    backend,
    storage,
    client,
    requests,
    engine: createSyncEngine({ client, storage, accountId: "user-a" }),
  };
}
const op = (n, overrides = {}) => ({
  operationId: `0192f3c4-0000-7000-8000-${String(n).padStart(12, "0")}`,
  accountId: "user-a",
  businessId: BIZ,
  environment: "test",
  resourceId: BIZ,
  kind: "profile.update",
  baseVersion: 1,
  dependsOn: [],
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  state: "pending",
  payload: { displayName: "Mi edición local" },
  retryCount: 0,
  ...overrides,
});

describe("cliente: getOfflineChanges", () => {
  it("valida la página con el esquema compartido y rechaza respuestas inválidas", async () => {
    const client = createMobileClient({ baseUrl: "https://api.test", platform: "ios", initialToken: "t" });
    const urls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        urls.push(String(url));
        return new Response(JSON.stringify(urls.length === 1 ? page({}) : { items: [], nextCursor: null }), {
          status: 200,
        });
      }),
    );
    expect(await client.getOfflineChanges({ cursor: "abc", limit: 50 })).toMatchObject({
      mode: "changes",
      hasMore: false,
    });
    expect(urls[0]).toBe("https://api.test/api/offline/changes?cursor=abc&limit=50");
    // Un cuerpo del contrato antiguo (sin cursor) no se acepta como descarga válida.
    await expect(client.getOfflineChanges()).rejects.toMatchObject({ code: "invalid_response" });
    vi.unstubAllGlobals();
  });
});

describe("aplicación de cambios y bajas en el almacenamiento móvil (C03)", () => {
  it("descarga el snapshot paginado y guarda datos y cursor; repetirlo no duplica", async () => {
    const first = page({
      mode: "snapshot",
      reset: true,
      snapshotComplete: false,
      hasMore: true,
      nextCursor: "s.1",
      items: [up("business_profile", BIZ, 5, profile(3)), up("business_location", loc(1), 6, location(1))],
    });
    const last = page({
      mode: "snapshot",
      snapshotComplete: true,
      hasMore: false,
      nextCursor: "c.1",
      items: [up("business_location", loc(2), 7, location(2))],
    });
    const { storage, engine, requests, backend } = setup([first, last]);
    const result = await engine.pull();
    expect(result).toMatchObject({ status: "up_to_date", pages: 2, applied: 3, restarts: 0 });
    expect(requests).toEqual([{}, { cursor: "s.1" }]);
    expect((await storage.loadOwnerProfile("user-a"))?.data.version).toBe(3);
    expect(Object.keys((await storage.loadLocations("user-a"))?.data ?? {}).sort()).toEqual([loc(1), loc(2)]);
    expect(await storage.loadSyncCursor("user-a")).toMatchObject({ cursor: "c.1", snapshotComplete: true });
    // Cada página se guardó con UNA transacción; nunca con escrituras independientes.
    expect(backend.transactions).toBe(2);
    expect(backend.setCalls).toBe(0);
    // Repetir una página ya aplicada es idempotente.
    expect(await storage.applyChangesPage("user-a", last)).toMatchObject({ applied: 0, skipped: 1 });
    expect(Object.keys((await storage.loadLocations("user-a"))?.data ?? {})).toHaveLength(2);
  });

  it("una interrupción a mitad de página no avanza el cursor ni guarda datos parciales", async () => {
    const { storage, engine, backend } = setup([
      page({
        nextCursor: "c.2",
        items: [up("business_profile", BIZ, 9, profile(4)), up("business_location", loc(1), 10, location(1))],
      }),
    ]);
    backend.failTransaction = new Error("proceso terminado a mitad de escritura");
    expect(await engine.pull()).toMatchObject({ status: "failed", pages: 0 });
    expect(await storage.loadSyncCursor("user-a")).toBeNull();
    expect(await storage.loadOwnerProfile("user-a")).toBeNull();
    expect(await storage.loadLocations("user-a")).toBeNull();
    // Al reintentar se aplica completa, una sola vez.
    backend.failTransaction = null;
    const again = setup([]);
    expect(again.backend.transactions).toBe(0);
  });

  it("una baja elimina la caché del recurso y deja constancia para no resucitarlo", async () => {
    const { storage } = setup();
    await storage.applyChangesPage(
      "user-a",
      page({
        nextCursor: "c.1",
        items: [
          up("business_location", loc(1), 5, location(1)),
          up("business_location", loc(2), 6, location(2)),
        ],
      }),
    );
    await storage.applyChangesPage(
      "user-a",
      page({ nextCursor: "c.2", items: [del("business_location", loc(1), 8)] }),
    );
    expect(Object.keys((await storage.loadLocations("user-a"))?.data ?? {})).toEqual([loc(2)]);
    // Un upsert antiguo (revisión 5) que llegue tarde no revive la sede dada de baja.
    await storage.applyChangesPage(
      "user-a",
      page({ nextCursor: "c.3", items: [up("business_location", loc(1), 5, location(1))] }),
    );
    expect(Object.keys((await storage.loadLocations("user-a"))?.data ?? {})).toEqual([loc(2)]);
    // Baja del perfil: se elimina el perfil guardado.
    await storage.applyChangesPage(
      "user-a",
      page({ nextCursor: "c.4", items: [up("business_profile", BIZ, 9, profile(2))] }),
    );
    expect(await storage.loadOwnerProfile("user-a")).not.toBeNull();
    await storage.applyChangesPage(
      "user-a",
      page({ nextCursor: "c.5", items: [del("business_profile", BIZ, 11)] }),
    );
    expect(await storage.loadOwnerProfile("user-a")).toBeNull();
  });

  it("el snapshot de recuperación (reset) limpia la caché pero conserva la cola y los pendientes inciertos", async () => {
    const { storage } = setup();
    await storage.applyChangesPage(
      "user-a",
      page({
        nextCursor: "c.1",
        items: [up("business_profile", BIZ, 5, profile(1)), up("business_location", loc(1), 6, location(1))],
      }),
    );
    await storage.enqueueOperation("user-a", op(1, { state: "sending" }));
    await storage.enqueueOperation(
      "user-a",
      op(2, { kind: "location.create", baseVersion: 1, payload: { name: "Borrador" } }),
    );
    await storage.applyChangesPage(
      "user-a",
      page({
        mode: "snapshot",
        reset: true,
        snapshotComplete: true,
        nextCursor: "c.9",
        items: [up("business_profile", BIZ, 20, profile(1))],
      }),
    );
    expect(await storage.loadLocations("user-a")).toBeNull();
    expect(await storage.loadOwnerProfile("user-a")).not.toBeNull();
    const queue = await storage.getQueue("user-a");
    expect(queue.map((o) => o.state).sort()).toEqual(["pending", "sending"]);
    expect(queue.find((o) => o.kind === "location.create")?.payload).toEqual({ name: "Borrador" });
  });

  it("no sobrescribe una edición local sin resolver: la conserva y la marca como conflicto si el servidor avanzó", async () => {
    const { storage, client, engine } = setup();
    await storage.enqueueOperation("user-a", op(1, { baseVersion: 2 }));
    await storage.enqueueOperation("user-a", op(2, { kind: "location.create", baseVersion: 5 }));
    const result = await storage.applyChangesPage(
      "user-a",
      page({ items: [up("business_profile", BIZ, 7, profile(4, "Servidor"))] }),
    );
    expect(result.conflictsFlagged).toBe(1);
    const queue = await storage.getQueue("user-a");
    const flagged = queue.find((o) => o.kind === "profile.update");
    expect(flagged).toMatchObject({
      state: "conflict",
      lastError: "profile_conflict",
      payload: { displayName: "Mi edición local" },
    });
    // La que ya partía de una versión igual o posterior sigue pendiente.
    expect(queue.find((o) => o.kind === "location.create")?.state).toBe("pending");
    // El conflicto no se reenvía solo.
    await engine.sync();
    expect(client.updateOwnerBusinessProfile).not.toHaveBeenCalled();
  });

  it("un pendiente antiguo no resucita un recurso dado de baja: pasa a fallido y no se envía", async () => {
    const { storage, client, engine } = setup();
    await storage.enqueueOperation("user-a", op(1));
    await storage.enqueueOperation("user-a", op(3, { state: "sending" }));
    const result = await storage.applyChangesPage(
      "user-a",
      page({ items: [del("business_profile", BIZ, 9)] }),
    );
    expect(result.removedFlagged).toBe(1);
    const queue = await storage.getQueue("user-a");
    expect(queue.find((o) => o.state === "failed")).toMatchObject({ lastError: "resource_removed" });
    // Lo que ya se estaba enviando queda para que lo reconcilie el sincronizador, no se descarta.
    expect(queue.find((o) => o.state === "sending")).toBeTruthy();
    expect(await engine.sync()).toMatchObject({ failed: 1 });
    expect(client.updateOwnerBusinessProfile).not.toHaveBeenCalled();
  });

  it("cursor vencido (410) o inválido (400): reinicia con snapshot una sola vez, sin tocar la cola", async () => {
    for (const failure of [
      { status: 410, code: "sync_cursor_expired", body: {} },
      { status: 400, code: "invalid_cursor", body: {} },
    ]) {
      const snapshot = page({
        mode: "snapshot",
        reset: true,
        nextCursor: "c.new",
        items: [up("business_profile", BIZ, 30, profile(7))],
      });
      const { storage, engine, requests } = setup([failure, snapshot]);
      await storage.applyChangesPage(
        "user-a",
        page({ nextCursor: "c.old", items: [up("business_profile", BIZ, 5, profile(1))] }),
      );
      await storage.enqueueOperation("user-a", op(1));
      expect(await engine.pull()).toMatchObject({ status: "up_to_date", restarts: 1 });
      expect(requests).toEqual([{ cursor: "c.old" }, {}]);
      expect((await storage.loadSyncCursor("user-a"))?.cursor).toBe("c.new");
      expect((await storage.getQueue("user-a")).length).toBe(1);
    }
    // Si vuelve a fallar tras reiniciar, no entra en bucle.
    const { engine } = setup([
      { status: 410, body: {} },
      { status: 410, body: {} },
    ]);
    expect(await engine.pull()).toMatchObject({ status: "failed", restarts: 1 });
  });

  it("401, red caída y almacenamiento lleno devuelven un estado explícito sin avanzar el cursor", async () => {
    expect(await setup([{ status: 401, code: "unauthenticated", body: {} }]).engine.pull()).toMatchObject({
      status: "auth_required",
    });
    expect(await setup([{ status: 0, code: "network", body: {} }]).engine.pull()).toMatchObject({
      status: "offline",
    });
    const { storage, engine } = setup([page({ items: [up("business_profile", BIZ, 5, profile(1))] })], {
      maxStorageBytes: 10,
    });
    expect(await engine.pull()).toMatchObject({ status: "storage_error", pages: 0 });
    expect(await storage.loadSyncCursor("user-a")).toBeNull();
  });

  it("los datos de una cuenta no aparecen en otra y una página tardía tras salir no recrea nada", async () => {
    const { storage, client, engine, backend } = setup([]);
    await storage.applyChangesPage("user-a", page({ items: [up("business_profile", BIZ, 5, profile(1))] }));
    expect(await storage.loadOwnerProfile("user-b")).toBeNull();
    expect(await storage.loadSyncCursor("user-b")).toBeNull();
    // Respuesta en vuelo cuando la persona sale: se descarta al aplicar.
    let release;
    client.getOfflineChanges.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(page({ items: [up("business_profile", BIZ, 9, profile(2))] }));
        }),
    );
    const pulling = engine.pull();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await signOutAccount({ accountId: "user-a", client, storage, drainTimeoutMs: 5 });
    release();
    expect(await pulling).toMatchObject({ status: "interrupted", interruptedBy: "exit" });
    expect(await storage.loadOwnerProfile("user-a")).toBeNull();
    expect([...backend.data.keys()].some((k) => k.includes("account_user-a"))).toBe(false);
    await expect(storage.applyChangesPage("user-a", page({}))).rejects.toThrow(AccountClosedError);
  });

  it("una página que llega mientras cambia el token no se aplica a la cuenta anterior", async () => {
    const { storage, client, engine } = setup([]);
    let release;
    client.getOfflineChanges.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(page({ items: [up("business_profile", BIZ, 9, profile(2))] }));
        }),
    );
    const pulling = engine.pull();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    client.setToken("token-b");
    release();
    expect(await pulling).toMatchObject({ status: "interrupted", interruptedBy: "session_changed" });
    expect(await storage.loadOwnerProfile("user-a")).toBeNull();
  });

  it("dos descargas simultáneas comparten una sola ejecución", async () => {
    const { engine, client } = setup([]);
    const [a, b] = await Promise.all([engine.pull(), engine.pull()]);
    expect(a).toBe(b);
    expect(client.getOfflineChanges).toHaveBeenCalledTimes(1);
  });

  it("sin backend (memoria) también es todo o nada ante falta de cuota", async () => {
    const storage = createEncryptedStorage({
      baseUrl: "https://api.micitaentiempo.online",
      environment: "test",
      maxStorageBytes: 400,
    });
    await expect(
      storage.applyChangesPage(
        "user-a",
        page({
          items: [
            up("business_profile", BIZ, 5, profile(1)),
            up("business_location", loc(1), 6, location(1)),
          ],
        }),
      ),
    ).rejects.toThrow(StorageQuotaExceededError);
    expect(await storage.loadSyncCursor("user-a")).toBeNull();
    expect(await storage.loadOwnerProfile("user-a")).toBeNull();
    expect(await storage.loadLocations("user-a")).toBeNull();
  });
});
