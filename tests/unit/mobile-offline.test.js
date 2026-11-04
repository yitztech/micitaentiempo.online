import { describe, expect, it, vi } from "vitest";
import {
  compactQueue,
  createEncryptedStorage,
  createSyncEngine,
  StorageQuotaExceededError,
  SYNCED_HISTORY_MAX,
} from "../../services/mobile/src/index.ts";

describe("Persistencia local cifrada y funcionamiento offline (C8a)", () => {
  it("recupera datos de un backend compartido entre instancias y purga solo la cuenta indicada", async () => {
    const items = new Map();
    const backend = {
      get: async (key) => items.get(key) ?? null,
      set: async (key, value) => {
        items.set(key, value);
      },
      remove: async (key) => {
        items.delete(key);
      },
      removePrefix: async (prefix) => {
        for (const key of items.keys()) if (key.startsWith(prefix)) items.delete(key);
      },
    };
    const first = createEncryptedStorage({ baseUrl: "https://example.com", backend });
    await first.saveBookings("alice", [{ id: "one" }]);
    await first.saveBookings("bob", [{ id: "two" }]);
    const restarted = createEncryptedStorage({ baseUrl: "https://example.com", backend });
    expect((await restarted.loadBookings("alice"))?.data).toEqual([{ id: "one" }]);
    await restarted.clearAccount("alice");
    expect(await restarted.loadBookings("alice")).toBeNull();
    expect((await restarted.loadBookings("bob"))?.data).toEqual([{ id: "two" }]);
  });
  it("cifra datos en reposo con AES-GCM y los recupera fielmente", async () => {
    const storage = createEncryptedStorage({
      baseUrl: "https://api.micitaentiempo.online",
      environment: "test",
      deviceSecret: "test-device-secret-1234",
    });

    const bookings = [
      {
        id: "bk-1",
        start: "2026-10-30T10:00:00Z",
        end: "2026-10-30T10:30:00Z",
        status: "confirmed",
      },
    ];

    await storage.saveBookings("user-1", bookings);

    // Recupera los datos descifrados
    const loaded = await storage.loadBookings("user-1");
    expect(loaded).not.toBeNull();
    expect(loaded?.data).toEqual(bookings);
    expect(loaded?.isStale).toBe(false);
    expect(typeof loaded?.cachedAt).toBe("string");
  });

  it("aísla estrictamente los datos entre distintas cuentas en el mismo dispositivo", async () => {
    const storage = createEncryptedStorage({
      baseUrl: "https://api.micitaentiempo.online",
      environment: "test",
    });

    await storage.saveBookings("user-alice", [{ id: "bk-alice" }]);
    await storage.saveBookings("user-bob", [{ id: "bk-bob" }]);

    const aliceData = await storage.loadBookings("user-alice");
    const bobData = await storage.loadBookings("user-bob");

    expect(aliceData?.data).toEqual([{ id: "bk-alice" }]);
    expect(bobData?.data).toEqual([{ id: "bk-bob" }]);
  });

  it("purga datos privados y cola de una cuenta al cerrar sesión o cambiar de cuenta (ADR 0019 §92)", async () => {
    const storage = createEncryptedStorage({
      baseUrl: "https://api.micitaentiempo.online",
      environment: "test",
    });

    await storage.saveBookings("user-alice", [{ id: "bk-alice" }]);
    await storage.enqueueOperation("user-alice", {
      operationId: "0192f3c4-0000-7000-8000-000000000001",
      accountId: "user-alice",
      businessId: null,
      environment: "test",
      resourceId: "0192f3c4-0000-7000-8000-000000000002",
      kind: "booking.cancel",
      baseVersion: null,
      dependsOn: [],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      state: "pending",
      payload: { reason: "Cancelación" },
      retryCount: 0,
    });

    // Cierra sesión / purga cuenta Alice
    await storage.clearAccount("user-alice");

    const loadedBookings = await storage.loadBookings("user-alice");
    expect(loadedBookings).toBeNull();

    const queue = await storage.getQueue("user-alice");
    expect(queue).toEqual([]);
  });

  it("detecta disco o cuota llenos y lanza error sin aparentar guardado exitoso (Escenario 89)", async () => {
    const storage = createEncryptedStorage({
      baseUrl: "https://api.micitaentiempo.online",
      environment: "test",
    });

    storage.setSimulatedDiskFull(true);

    await expect(storage.saveBookings("user-1", [{ id: "bk-1" }])).rejects.toThrow(StorageQuotaExceededError);
  });

  it("rechaza encolar más de 100 operaciones pendientes respetando OFFLINE_LIMITS", async () => {
    const storage = createEncryptedStorage({
      baseUrl: "https://api.micitaentiempo.online",
      environment: "test",
    });

    for (let i = 0; i < 100; i++) {
      await storage.enqueueOperation("user-1", {
        operationId: `0192f3c4-0000-7000-8000-${String(i).padStart(12, "0")}`,
        accountId: "user-1",
        businessId: null,
        environment: "test",
        resourceId: "0192f3c4-0000-7000-8000-000000000099",
        kind: "booking.cancel",
        baseVersion: null,
        dependsOn: [],
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        state: "pending",
        payload: {},
        retryCount: 0,
      });
    }

    const queue = await storage.getQueue("user-1");
    expect(queue).toHaveLength(100);

    await expect(
      storage.enqueueOperation("user-1", {
        operationId: "0192f3c4-0000-7000-8000-000000000101",
        accountId: "user-1",
        businessId: null,
        environment: "test",
        resourceId: "0192f3c4-0000-7000-8000-000000000099",
        kind: "booking.cancel",
        baseVersion: null,
        dependsOn: [],
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        state: "pending",
        payload: {},
        retryCount: 0,
      }),
    ).rejects.toThrow(StorageQuotaExceededError);
  });
});

describe("Cola durable, sincronización segura y resolución de conflictos (C8b)", () => {
  it("conserva operaciones encoladas simultáneamente incluso desde dos instancias", async () => {
    const items = new Map();
    const backend = {
      get: async (key) => items.get(key) ?? null,
      set: async (key, value) => {
        await Promise.resolve();
        items.set(key, value);
      },
      remove: async (key) => {
        items.delete(key);
      },
      removePrefix: async () => {},
    };
    const first = createEncryptedStorage({ baseUrl: "https://example.com", backend });
    const second = createEncryptedStorage({ baseUrl: "https://example.com", backend });
    const engine1 = createSyncEngine({ storage: first, client: {}, accountId: "user-1" });
    const engine2 = createSyncEngine({ storage: second, client: {}, accountId: "user-1" });
    const input = { kind: "booking.cancel", resourceId: "0192f3c4-0000-7000-8000-000000000001", payload: {} };
    await Promise.all([engine1.enqueue(input), engine2.enqueue(input)]);
    expect(await first.getQueue("user-1")).toHaveLength(2);
  });

  it("no sobrescribe una cola dañada al intentar encolar otra operación", async () => {
    const backend = {
      get: async () => "{invalid json",
      set: vi.fn(),
      remove: async () => {},
      removePrefix: async () => {},
    };
    const storage = createEncryptedStorage({ baseUrl: "https://example.com", backend });
    const engine = createSyncEngine({ storage, client: {}, accountId: "user-1" });
    await expect(
      engine.enqueue({
        kind: "booking.cancel",
        resourceId: "0192f3c4-0000-7000-8000-000000000001",
        payload: {},
      }),
    ).rejects.toThrow();
    expect(backend.set).not.toHaveBeenCalled();
  });

  it("bloquea dependientes y el mismo recurso tras un conflicto, pero procesa recursos independientes", async () => {
    const storage = createEncryptedStorage({ baseUrl: "https://example.com" });
    const client = {
      cancelBooking: vi.fn().mockRejectedValueOnce({ status: 409 }).mockResolvedValue({ ok: true }),
    };
    const engine = createSyncEngine({ storage, client, accountId: "user-1" });
    const resource = "0192f3c4-0000-7000-8000-000000000001";
    const other = "0192f3c4-0000-7000-8000-000000000002";
    const first = await engine.enqueue({ kind: "booking.cancel", resourceId: resource, payload: {} });
    await engine.enqueue({ kind: "booking.cancel", resourceId: resource, payload: {} });
    await engine.enqueue({
      kind: "booking.cancel",
      resourceId: other,
      dependsOn: [first.operationId],
      payload: {},
    });
    await engine.enqueue({
      kind: "booking.cancel",
      resourceId: "0192f3c4-0000-7000-8000-000000000003",
      payload: {},
    });
    expect(await engine.sync()).toMatchObject({ conflicts: 1, pending: 2, synced: 1 });
    expect(client.cancelBooking).toHaveBeenCalledTimes(2);
  });

  it("comparte una sincronización concurrente de la misma cuenta entre motores", async () => {
    const storage = createEncryptedStorage({ baseUrl: "https://example.com" });
    const client = { cancelBooking: vi.fn(async () => ({ ok: true })) };
    const first = createSyncEngine({ storage, client, accountId: "user-1" });
    const second = createSyncEngine({ storage, client, accountId: "user-1" });
    await first.enqueue({
      kind: "booking.cancel",
      resourceId: "0192f3c4-0000-7000-8000-000000000001",
      payload: {},
    });
    const results = await Promise.all([first.sync(), second.sync()]);
    expect(results[0].synced).toBe(1);
    expect(results[1].synced).toBe(1);
    expect(client.cancelBooking).toHaveBeenCalledTimes(1);
  });
  it("reconcilia una operación interrumpida al enviarse y no reenvía si no puede consultar el recibo", async () => {
    const storage = createEncryptedStorage({ baseUrl: "https://api.micitaentiempo.online" });
    const client = {
      updateOwnerBusinessProfile: vi.fn(),
      getOperationReceipt: vi.fn().mockRejectedValue({ status: 503 }),
    };
    const engine = createSyncEngine({ client, storage, accountId: "user-1" });
    const op = await engine.enqueue({
      kind: "profile.update",
      resourceId: "0192f3c4-0000-7000-8000-000000000001",
      businessId: "0192f3c4-0000-7000-8000-000000000001",
      baseVersion: 1,
      payload: { displayName: "Clínica" },
    });
    await storage.updateOperation("user-1", op.operationId, { state: "sending" });
    expect((await engine.sync()).pending).toBe(1);
    expect(client.updateOwnerBusinessProfile).not.toHaveBeenCalled();
    client.getOperationReceipt.mockResolvedValue({ status: 200, body: { version: 2 } });
    expect((await engine.sync()).synced).toBe(1);
    expect(client.updateOwnerBusinessProfile).not.toHaveBeenCalled();
  });

  it("detiene una operación cuando se revocan sus permisos", async () => {
    const storage = createEncryptedStorage({ baseUrl: "https://api.micitaentiempo.online" });
    const client = {
      cancelBooking: vi.fn().mockRejectedValue({ status: 403 }),
      getOperationReceipt: vi.fn(),
    };
    const engine = createSyncEngine({ client, storage, accountId: "user-1" });
    await engine.enqueue({
      kind: "booking.cancel",
      resourceId: "0192f3c4-0000-7000-8000-000000000001",
      payload: {},
    });
    expect((await engine.sync()).failed).toBe(1);
    expect((await engine.getPendingOperations())[0]).toMatchObject({
      state: "failed",
      lastError: "permission_denied",
    });
    await engine.sync();
    expect(client.cancelBooking).toHaveBeenCalledTimes(1);
  });
  it("encola operaciones con UUID estable y validación contra OfflineOperationMetadata", async () => {
    const storage = createEncryptedStorage({ baseUrl: "https://api.micitaentiempo.online" });
    const mockClient = {
      updateOwnerBusinessProfile: vi.fn(),
      addBusinessLocation: vi.fn(),
      cancelBooking: vi.fn(),
      getOperationReceipt: vi.fn(),
    };

    const syncEngine = createSyncEngine({
      client: mockClient,
      storage,
      accountId: "user-1",
    });

    const op = await syncEngine.enqueue({
      kind: "profile.update",
      resourceId: "0192f3c4-0000-7000-8000-000000000001",
      businessId: "0192f3c4-0000-7000-8000-000000000001",
      baseVersion: 1,
      payload: { displayName: "Clínica Dental Avanzada" },
    });

    expect(op.operationId).toBeDefined();
    expect(op.state).toBe("pending");
    expect(op.kind).toBe("profile.update");

    const pending = await syncEngine.getPendingOperations();
    expect(pending).toHaveLength(1);
    expect(pending[0].operationId).toBe(op.operationId);
  });

  it("reconcilia el recibo del servidor tras un timeout/reintento sin duplicar la mutación (Escenario 43)", async () => {
    const storage = createEncryptedStorage({ baseUrl: "https://api.micitaentiempo.online" });
    const opId = "0192f3c4-0000-7000-8000-000000000010";

    const mockClient = {
      updateOwnerBusinessProfile: vi.fn(),
      addBusinessLocation: vi.fn(),
      cancelBooking: vi.fn(),
      getOperationReceipt: vi.fn(async (id) => {
        if (id === opId) {
          return {
            operationId: opId,
            action: "profile.update",
            status: 200,
            body: { version: 2 },
            createdAt: new Date().toISOString(),
          };
        }
        throw { status: 404 };
      }),
    };

    const syncEngine = createSyncEngine({
      client: mockClient,
      storage,
      accountId: "user-1",
    });

    // Simulamos que la operación falló previamente por timeout (retryCount = 1)
    await storage.enqueueOperation("user-1", {
      operationId: opId,
      accountId: "user-1",
      businessId: null,
      environment: "production",
      resourceId: "0192f3c4-0000-7000-8000-000000000099",
      kind: "profile.update",
      baseVersion: 1,
      dependsOn: [],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      state: "pending",
      payload: { displayName: "Clínica" },
      retryCount: 1,
    });

    const res = await syncEngine.sync();
    expect(res.synced).toBe(1);

    // Verificamos que NO se volvió a invocar la mutación porque se recuperó el recibo existente
    expect(mockClient.updateOwnerBusinessProfile).not.toHaveBeenCalled();
    expect(mockClient.getOperationReceipt).toHaveBeenCalledWith(opId);

    const pending = await syncEngine.getPendingOperations();
    expect(pending[0].state).toBe("synced");
  });

  it("gestiona 409 Conflict marcando estado de conflicto sin sobrescribir silenciosamente (Escenarios 51, 66)", async () => {
    const storage = createEncryptedStorage({ baseUrl: "https://api.micitaentiempo.online" });
    const mockClient = {
      updateOwnerBusinessProfile: vi.fn(async () => {
        throw { status: 409, code: "profile_conflict", body: { message: "Versión obsoleta" } };
      }),
      addBusinessLocation: vi.fn(),
      cancelBooking: vi.fn(),
      getOperationReceipt: vi.fn(),
    };

    const syncEngine = createSyncEngine({
      client: mockClient,
      storage,
      accountId: "user-owner",
    });

    const op = await syncEngine.enqueue({
      kind: "profile.update",
      resourceId: "0192f3c4-0000-7000-8000-000000000001",
      baseVersion: 1,
      payload: { displayName: "Nombre Antiguo" },
    });

    const res = await syncEngine.sync();
    expect(res.conflicts).toBe(1);

    const pending = await syncEngine.getPendingOperations();
    expect(pending[0].state).toBe("conflict");
    expect(pending[0].lastError).toBe("profile_conflict");

    // Permite al usuario resolver el conflicto con la versión nueva
    await syncEngine.resolveConflict(op.operationId, "retry_with_version", 2);
    const updated = await syncEngine.getPendingOperations();
    expect(updated[0].state).toBe("pending");
    expect(updated[0].baseVersion).toBe(2);
  });

  it("pausa la cola y exige reautenticación ante un error 401 Unauthorized", async () => {
    const storage = createEncryptedStorage({ baseUrl: "https://api.micitaentiempo.online" });
    const mockClient = {
      updateOwnerBusinessProfile: vi.fn(),
      addBusinessLocation: vi.fn(),
      cancelBooking: vi.fn(async () => {
        throw { status: 401, code: "unauthorized" };
      }),
      getOperationReceipt: vi.fn(),
    };

    const syncEngine = createSyncEngine({
      client: mockClient,
      storage,
      accountId: "user-1",
    });

    await syncEngine.enqueue({
      kind: "booking.cancel",
      resourceId: "0192f3c4-0000-7000-8000-000000000001",
      payload: {},
    });

    const res = await syncEngine.sync();
    expect(res.authRequired).toBe(true);

    const pending = await syncEngine.getPendingOperations();
    expect(pending[0].state).toBe("authentication_required");
  });
});

describe("resultados inciertos: se reconcilian antes de caducar (M03)", () => {
  const OP = "0192f3c4-0000-7000-8000-0000000000a1";
  const RES = "0192f3c4-0000-7000-8000-0000000000b1";
  const HOUR = 3600 * 1000;

  async function seed(storage, overrides = {}) {
    await storage.enqueueOperation("user-1", {
      operationId: OP,
      accountId: "user-1",
      businessId: RES,
      environment: "production",
      resourceId: RES,
      kind: "profile.update",
      baseVersion: 1,
      dependsOn: [],
      createdAt: new Date(Date.now() - 30 * HOUR).toISOString(),
      expiresAt: new Date(Date.now() - 6 * HOUR).toISOString(),
      state: "sending",
      payload: { displayName: "Clínica" },
      retryCount: 0,
      ...overrides,
    });
  }
  const setup = (client = {}) => {
    const storage = createEncryptedStorage({ baseUrl: "https://api.micitaentiempo.online" });
    const mock = {
      updateOwnerBusinessProfile: vi.fn(async () => ({ version: 3 })),
      cancelBooking: vi.fn(async () => ({ id: RES, status: "cancelled" })),
      getOperationReceipt: vi.fn(),
      myBookings: vi.fn(),
      ...client,
    };
    return {
      storage,
      client: mock,
      engine: createSyncEngine({ client: mock, storage, accountId: "user-1" }),
    };
  };
  const stored = async (engine) => (await engine.getPendingOperations())[0];

  it("timeout tras el commit y reapertura pasadas 24 h: recupera el éxito sin reenviar", async () => {
    const { storage, client, engine } = setup();
    client.getOperationReceipt.mockResolvedValue({ status: 200, body: { version: 2 } });
    await seed(storage);
    expect(await engine.sync()).toMatchObject({ synced: 1, expired: 0 });
    expect(client.getOperationReceipt).toHaveBeenCalledWith(OP);
    expect(client.updateOwnerBusinessProfile).not.toHaveBeenCalled();
    expect(await stored(engine)).toMatchObject({ state: "synced", lastError: null });
  });

  it("sin recibo (404) y fuera de plazo: no muta y queda caducada sin enviar", async () => {
    const { storage, client, engine } = setup();
    client.getOperationReceipt.mockRejectedValue({ status: 404 });
    await seed(storage);
    expect(await engine.sync()).toMatchObject({ expired: 1, synced: 0 });
    expect(client.updateOwnerBusinessProfile).not.toHaveBeenCalled();
    expect(await stored(engine)).toMatchObject({ state: "expired", lastError: "expired_unsent" });
  });

  it("si falla la consulta del recibo no descarta nada y vuelve a consultar después", async () => {
    const { storage, client, engine } = setup();
    client.getOperationReceipt.mockRejectedValue({ status: 0, code: "network" });
    await seed(storage);
    expect(await engine.sync()).toMatchObject({ pending: 1, expired: 0 });
    expect(await stored(engine)).toMatchObject({ state: "sending" });
    client.getOperationReceipt.mockResolvedValue({ status: 200, body: {} });
    expect(await engine.sync()).toMatchObject({ synced: 1 });
    expect(client.updateOwnerBusinessProfile).not.toHaveBeenCalled();
  });

  it("401 al consultar el recibo pausa y exige acceso sin caducar la operación", async () => {
    const { storage, client, engine } = setup();
    client.getOperationReceipt.mockRejectedValue({ status: 401 });
    await seed(storage);
    expect(await engine.sync()).toMatchObject({ authRequired: true, pending: 1, expired: 0 });
    expect(await stored(engine)).toMatchObject({ state: "sending" });
  });

  it("410 (recibo retenido ya no existe): resultado desconocido, caducada y sin reenviar", async () => {
    const { storage, client, engine } = setup();
    client.getOperationReceipt.mockRejectedValue({ status: 410 });
    await seed(storage, { expiresAt: new Date(Date.now() + HOUR).toISOString() });
    expect(await engine.sync()).toMatchObject({ expired: 1 });
    expect(client.updateOwnerBusinessProfile).not.toHaveBeenCalled();
    expect(await stored(engine)).toMatchObject({ state: "expired", lastError: "outcome_unknown" });
  });

  it("dentro del plazo y sin recibo: reenvía con la clave original", async () => {
    const { storage, client, engine } = setup();
    client.getOperationReceipt.mockRejectedValue({ status: 404 });
    await seed(storage, {
      expiresAt: new Date(Date.now() + HOUR).toISOString(),
      retryCount: 1,
      state: "pending",
    });
    expect(await engine.sync()).toMatchObject({ synced: 1 });
    expect(client.updateOwnerBusinessProfile).toHaveBeenCalledWith({ displayName: "Clínica" }, 1, OP);
  });

  it("un recibo con error no se convierte en éxito: 409 → conflicto, 422 → fallo, 5xx no concluyente", async () => {
    for (const [status, expected] of [
      [409, { state: "conflict", lastError: "profile_conflict" }],
      [422, { state: "failed", lastError: "validation_failed" }],
      [403, { state: "failed", lastError: "permission_denied" }],
    ]) {
      const { storage, client, engine } = setup();
      client.getOperationReceipt.mockResolvedValue({ status, body: {} });
      await seed(storage);
      await engine.sync();
      expect(await stored(engine)).toMatchObject(expected);
      expect(client.updateOwnerBusinessProfile).not.toHaveBeenCalled();
    }
    const { storage, client, engine } = setup();
    client.getOperationReceipt.mockResolvedValue({ status: 500, body: {} });
    await seed(storage, { expiresAt: new Date(Date.now() + HOUR).toISOString() });
    expect(await engine.sync()).toMatchObject({ synced: 1 });
    expect(client.updateOwnerBusinessProfile).toHaveBeenCalledTimes(1);
  });

  it("una operación nunca enviada y vencida caduca sin consultar al servidor", async () => {
    const { storage, client, engine } = setup();
    await seed(storage, { state: "pending", retryCount: 0 });
    expect(await engine.sync()).toMatchObject({ expired: 1 });
    expect(client.getOperationReceipt).not.toHaveBeenCalled();
    expect(client.updateOwnerBusinessProfile).not.toHaveBeenCalled();
  });

  it("getPendingOperations no caduca una operación ya intentada (retryCount > 0)", async () => {
    const { storage, engine } = setup();
    await seed(storage, { state: "pending", retryCount: 2 });
    expect(await stored(engine)).toMatchObject({ state: "pending" });
  });

  describe("cancelación de cita (sin recibo durable en el servidor)", () => {
    const seedCancel = (storage, overrides = {}) =>
      seed(storage, {
        kind: "booking.cancel",
        businessId: null,
        baseVersion: null,
        payload: {},
        ...overrides,
      });

    it("cita ausente de la lista: se aplicó; se marca sincronizada sin reenviar", async () => {
      const { storage, client, engine } = setup();
      client.myBookings.mockResolvedValue([{ id: "otra", status: "confirmed" }]);
      await seedCancel(storage);
      expect(await engine.sync()).toMatchObject({ synced: 1 });
      expect(client.myBookings).toHaveBeenCalledWith(true);
      expect(client.cancelBooking).not.toHaveBeenCalled();
      expect(client.getOperationReceipt).not.toHaveBeenCalled();
    });

    it("cita todavía vigente y fuera de plazo: no se aplicó y no se envía", async () => {
      const { storage, client, engine } = setup();
      client.myBookings.mockResolvedValue([{ id: RES, status: "confirmed" }]);
      await seedCancel(storage);
      expect(await engine.sync()).toMatchObject({ expired: 1 });
      expect(client.cancelBooking).not.toHaveBeenCalled();
    });

    it("cita todavía vigente y dentro de plazo: se reenvía con la clave original", async () => {
      const { storage, client, engine } = setup();
      client.myBookings.mockResolvedValue([{ id: RES, status: "confirmed" }]);
      await seedCancel(storage, { expiresAt: new Date(Date.now() + HOUR).toISOString() });
      expect(await engine.sync()).toMatchObject({ synced: 1 });
      expect(client.cancelBooking).toHaveBeenCalledWith(RES, {}, OP);
    });

    it("si no puede consultar la lista conserva la incertidumbre", async () => {
      const { storage, client, engine } = setup();
      client.myBookings.mockRejectedValue({ status: 0, code: "timeout" });
      await seedCancel(storage);
      expect(await engine.sync()).toMatchObject({ pending: 1, expired: 0 });
      expect(client.cancelBooking).not.toHaveBeenCalled();
      expect(await stored(engine)).toMatchObject({ state: "sending" });
    });
  });
});

describe("cuota de pendientes y compactación del historial (M04)", () => {
  const id = (n) => `0192f3c4-0000-7000-8000-${String(n).padStart(12, "0")}`;
  const op = (n, overrides = {}) => ({
    operationId: id(n),
    accountId: "user-1",
    businessId: null,
    environment: "test",
    resourceId: id(900),
    kind: "booking.cancel",
    baseVersion: null,
    dependsOn: [],
    createdAt: new Date(Date.now() + n).toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    state: "pending",
    payload: {},
    retryCount: 0,
    ...overrides,
  });
  const newStorage = () =>
    createEncryptedStorage({ baseUrl: "https://api.micitaentiempo.online", environment: "test" });
  /** Siembra el estado directamente en la cola (como lo dejaría el sincronizador tras confirmar). */
  async function seed(storage, ops) {
    for (const o of ops) await storage.enqueueOperation("user-1", o);
  }

  it("más de 100 operaciones completadas permiten encolar una nueva", async () => {
    const storage = newStorage();
    for (let i = 0; i < 130; i++) {
      await storage.enqueueOperation("user-1", op(i));
      await storage.updateOperation("user-1", id(i), { state: "synced" });
    }
    await expect(storage.enqueueOperation("user-1", op(500))).resolves.toBeUndefined();
    const queue = await storage.getQueue("user-1");
    expect(queue.filter((o) => o.state === "synced").length).toBeLessThanOrEqual(SYNCED_HISTORY_MAX);
    expect(queue.find((o) => o.operationId === id(500))?.state).toBe("pending");
  });

  it("100 pendientes siguen bloqueando una nueva aunque haya historial confirmado", async () => {
    const storage = newStorage();
    await seed(
      storage,
      Array.from({ length: 100 }, (_, i) => op(i)),
    );
    await storage.updateOperation("user-1", id(0), { state: "synced" });
    await storage.enqueueOperation("user-1", op(200));
    await expect(storage.enqueueOperation("user-1", op(201))).rejects.toThrow(StorageQuotaExceededError);
  });

  it("sending, conflicto, fallo, caducada y autenticación pendiente nunca se compactan ni se cuentan como historial", async () => {
    const storage = newStorage();
    const states = ["sending", "conflict", "failed", "expired", "authentication_required", "pending"];
    await seed(
      storage,
      states.map((state, i) => op(i, { state })),
    );
    for (let i = 10; i < 70; i++) {
      await storage.enqueueOperation("user-1", op(i));
      await storage.updateOperation("user-1", id(i), { state: "synced" });
    }
    await storage.enqueueOperation("user-1", op(999));
    const queue = await storage.getQueue("user-1");
    for (let i = 0; i < states.length; i++) {
      expect(queue.find((o) => o.operationId === id(i))?.state).toBe(states[i]);
    }
  });

  it("no elimina una operación confirmada de la que depende una no confirmada", async () => {
    const storage = newStorage();
    await storage.enqueueOperation("user-1", op(1));
    await storage.updateOperation("user-1", id(1), {
      state: "synced",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    await storage.enqueueOperation("user-1", op(2, { dependsOn: [id(1)] }));
    for (let i = 10; i < 60; i++) {
      await storage.enqueueOperation("user-1", op(i));
      await storage.updateOperation("user-1", id(i), { state: "synced" });
    }
    await storage.enqueueOperation("user-1", op(3));
    const queue = await storage.getQueue("user-1");
    expect(queue.find((o) => o.operationId === id(1))?.state).toBe("synced");
    // Una vez confirmado el dependiente, la antigua deja de hacer falta y puede compactarse.
    await storage.updateOperation("user-1", id(2), { state: "synced" });
    await storage.enqueueOperation("user-1", op(4));
    expect((await storage.getQueue("user-1")).some((o) => o.operationId === id(1))).toBe(false);
  });

  it("el sincronizador sigue liberando al dependiente tras compactar", async () => {
    const storage = newStorage();
    const client = { cancelBooking: vi.fn(async () => ({ ok: true })) };
    const engine = createSyncEngine({ client, storage, accountId: "user-1" });
    await storage.enqueueOperation("user-1", op(1));
    await storage.updateOperation("user-1", id(1), {
      state: "synced",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    await storage.enqueueOperation("user-1", op(2, { dependsOn: [id(1)], resourceId: id(901) }));
    for (let i = 10; i < 60; i++) {
      await storage.enqueueOperation("user-1", op(i));
      await storage.updateOperation("user-1", id(i), { state: "synced" });
    }
    await storage.enqueueOperation("user-1", op(3, { resourceId: id(902) }));
    expect(await engine.sync()).toMatchObject({ pending: 0 });
    expect(client.cancelBooking).toHaveBeenCalledWith(id(901), {}, id(2));
  });

  it("descarta del historial lo que supera la retención de recibos", () => {
    const old = op(1, { state: "synced", createdAt: "2020-01-01T00:00:00.000Z" });
    const recent = op(2, { state: "synced" });
    expect(compactQueue([old, recent]).map((o) => o.operationId)).toEqual([id(2)]);
  });

  it("un fallo de escritura no pierde la cola previa", async () => {
    const storage = newStorage();
    await seed(storage, [op(1), op(2)]);
    storage.setSimulatedDiskFull(true);
    await expect(storage.enqueueOperation("user-1", op(3))).rejects.toThrow(StorageQuotaExceededError);
    storage.setSimulatedDiskFull(false);
    expect((await storage.getQueue("user-1")).map((o) => o.operationId)).toEqual([id(1), id(2)]);
  });

  it("dos escrituras simultáneas preservan ambas operaciones", async () => {
    const storage = newStorage();
    await Promise.all([storage.enqueueOperation("user-1", op(1)), storage.enqueueOperation("user-1", op(2))]);
    await Promise.all([
      storage.updateOperation("user-1", id(1), { retryCount: 3 }),
      storage.enqueueOperation("user-1", op(3)),
      storage.updateOperation("user-1", id(2), { state: "synced" }),
    ]);
    const queue = await storage.getQueue("user-1");
    expect(queue.map((o) => o.operationId).sort()).toEqual([id(1), id(2), id(3)]);
    expect(queue.find((o) => o.operationId === id(1))?.retryCount).toBe(3);
    expect(queue.find((o) => o.operationId === id(2))?.state).toBe("synced");
  });
});
