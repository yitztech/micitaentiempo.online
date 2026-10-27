import { describe, expect, it, vi } from "vitest";
import {
  createEncryptedStorage,
  createSyncEngine,
  StorageQuotaExceededError,
} from "../../services/mobile/src/index.ts";

describe("Persistencia local cifrada y funcionamiento offline (C8a)", () => {
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
            action: "booking.cancel",
            status: 200,
            body: { id: "bk-1", status: "cancelled" },
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
      kind: "booking.cancel",
      baseVersion: null,
      dependsOn: [],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      state: "pending",
      payload: { reason: "Cita cancelada" },
      retryCount: 1,
    });

    const res = await syncEngine.sync();
    expect(res.synced).toBe(1);

    // Verificamos que NO se volvió a invocar cancelBooking porque se recuperó el recibo existente
    expect(mockClient.cancelBooking).not.toHaveBeenCalled();
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
