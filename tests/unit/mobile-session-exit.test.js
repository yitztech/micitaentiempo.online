import { describe, expect, it, vi } from "vitest";
import {
  AccountClosedError,
  createEncryptedStorage,
  createSyncEngine,
  MOBILE_LANGUAGES,
  MOBILE_STRINGS,
  refreshCachedSession,
  requestSignOut,
  signOutAccount,
  unresolvedOperations,
} from "../../services/mobile/src/index.ts";

const id = (n) => `0192f3c4-0000-7000-8000-${String(n).padStart(12, "0")}`;
const op = (n, accountId = "user-a", overrides = {}) => ({
  operationId: id(n),
  accountId,
  businessId: null,
  environment: "test",
  resourceId: id(900 + n),
  kind: "booking.cancel",
  baseVersion: null,
  dependsOn: [],
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  state: "pending",
  payload: {},
  retryCount: 0,
  ...overrides,
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Cliente de pruebas con token mutable; `cancelBooking` se controla desde el test. */
function setup({ signOut } = {}) {
  const storage = createEncryptedStorage({
    baseUrl: "https://api.micitaentiempo.online",
    environment: "test",
  });
  let token = "token-a";
  const sends = [];
  const gates = [];
  const client = {
    getToken: () => token,
    setToken: (next) => {
      token = next;
    },
    signOut: vi.fn(signOut ?? (async () => undefined)),
    cancelBooking: vi.fn((resource, _body, key) => {
      sends.push({ resource, key, token });
      const gate = deferred();
      gates.push(gate);
      return gate.promise;
    }),
    getOperationReceipt: vi.fn(),
    myBookings: vi.fn(async () => []),
  };
  return {
    storage,
    client,
    sends,
    gates,
    engine: createSyncEngine({ client, storage, accountId: "user-a" }),
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
/** El almacenamiento usa WebCrypto (hilo aparte): se espera a la condición en lugar de contar turnos. */
async function until(condition) {
  for (let i = 0; i < 200 && !condition(); i++) await tick();
  expect(condition()).toBe(true);
}

describe("salida coordinada con la sincronización (M05)", () => {
  it("sincronizar → pedir salida → llega la respuesta tardía: no se recrean datos privados", async () => {
    const { storage, client, sends, gates, engine } = setup();
    await storage.enqueueOperation("user-a", op(1));
    await storage.enqueueOperation("user-a", op(2));
    const syncing = engine.sync();
    await until(() => sends.length === 1);

    const exiting = signOutAccount({ accountId: "user-a", client, storage });
    await until(() => storage.accountState("user-a") === "closing");
    // La salida espera al envío en vuelo; la segunda operación no empieza.
    gates[0].resolve({ ok: true });
    const result = await syncing;
    expect(result).toMatchObject({ interruptedBy: "exit", synced: 1, pending: 1 });
    expect(await exiting).toMatchObject({ status: "signed_out", purged: true, revoked: true, drained: true });

    expect(sends).toHaveLength(1);
    expect(await storage.getQueue("user-a")).toEqual([]);
    // Tareas antiguas que escriben después de la purga se descartan.
    await storage.saveBookings("user-a", [{ id: "x" }]);
    await storage.saveSummary("user-a", { user: { id: "user-a" } });
    await storage.saveOwnerProfile("user-a", { name: "x" });
    await storage.updateOperation("user-a", id(1), { state: "synced" });
    expect(await storage.loadBookings("user-a")).toBeNull();
    expect(await storage.loadSummary("user-a")).toBeNull();
    expect(await storage.loadOwnerProfile("user-a")).toBeNull();
    expect(await storage.getQueue("user-a")).toEqual([]);
    await expect(storage.enqueueOperation("user-a", op(3))).rejects.toThrow(AccountClosedError);
  });

  it("si la espera se agota, la respuesta que llega después de la purga no recrea nada", async () => {
    const { storage, client, gates, engine } = setup();
    await storage.enqueueOperation("user-a", op(1));
    const syncing = engine.sync();
    await until(() => gates.length === 1);
    const result = await signOutAccount({ accountId: "user-a", client, storage, drainTimeoutMs: 5 });
    expect(result).toMatchObject({ status: "signed_out", drained: false, purged: true });
    gates[0].resolve({ ok: true });
    await syncing;
    expect(await storage.getQueue("user-a")).toEqual([]);
  });

  it("cambiar de cuenta no envía la cola anterior con el token nuevo", async () => {
    const { storage, client, sends, gates, engine } = setup();
    await storage.enqueueOperation("user-a", op(1));
    await storage.enqueueOperation("user-a", op(2));
    const syncing = engine.sync();
    await until(() => gates.length === 1);
    // La app cambia al token de otra cuenta mientras el primer envío sigue en vuelo.
    client.setToken("token-b");
    gates[0].resolve({ ok: true });
    const result = await syncing;
    expect(result).toMatchObject({ interruptedBy: "session_changed", pending: 1 });
    expect(sends.map((s) => s.token)).toEqual(["token-a"]);
    expect(client.cancelBooking).toHaveBeenCalledTimes(1);
  });

  it("salir de una cuenta no toca la cola ni el estado de otra", async () => {
    const { storage, client, engine } = setup();
    await storage.enqueueOperation("user-a", op(1));
    await storage.enqueueOperation("user-b", op(2, "user-b"));
    await signOutAccount({ accountId: "user-a", client, storage });
    expect(storage.accountState("user-b")).toBe("open");
    expect((await storage.getQueue("user-b")).map((o) => o.operationId)).toEqual([id(2)]);
    await expect(storage.enqueueOperation("user-b", op(4, "user-b"))).resolves.toBeUndefined();
    // Un motor de la cuenta cerrada no envía nada.
    expect(await engine.sync()).toMatchObject({ synced: 0, total: 0 });
  });

  it("un fallo de red al revocar deja un resultado explícito y cierra igualmente la sesión local", async () => {
    const { storage, client } = setup({
      signOut: async () => Promise.reject({ status: 0, code: "network" }),
    });
    await storage.enqueueOperation("user-a", op(1));
    const result = await signOutAccount({ accountId: "user-a", client, storage });
    expect(result).toEqual({ status: "signed_out_unrevoked", revoked: false, purged: true, drained: true });
    expect(client.getToken()).toBeNull();
    expect(await storage.getQueue("user-a")).toEqual([]);
  });

  it("401 al revocar equivale a sesión ya revocada", async () => {
    const { storage, client } = setup({ signOut: async () => Promise.reject({ status: 401 }) });
    expect(await signOutAccount({ accountId: "user-a", client, storage })).toMatchObject({
      status: "signed_out",
      revoked: true,
    });
  });

  it("si la purga falla no informa de un cierre limpio y la cuenta sigue cerrada", async () => {
    const { storage, client } = setup();
    vi.spyOn(storage, "clearAccount").mockRejectedValue(new Error("disco"));
    const result = await signOutAccount({ accountId: "user-a", client, storage });
    expect(result).toMatchObject({ status: "purge_failed", purged: false });
    expect(client.getToken()).toBeNull();
  });

  it("un nuevo inicio de sesión de la misma cuenta la reabre", async () => {
    const { storage, client } = setup();
    await signOutAccount({ accountId: "user-a", client, storage });
    await expect(storage.enqueueOperation("user-a", op(5))).rejects.toThrow(AccountClosedError);
    storage.openAccount("user-a");
    await expect(storage.enqueueOperation("user-a", op(5))).resolves.toBeUndefined();
  });
});

describe("advertencia de pendientes al cerrar sesión (M06)", () => {
  const STATES = ["pending", "sending", "authentication_required", "conflict", "failed", "expired"];

  it("con cero pendientes sale directamente, sin preguntar", async () => {
    const { storage, client } = setup();
    const confirm = vi.fn();
    await storage.enqueueOperation("user-a", op(1));
    await storage.updateOperation("user-a", id(1), { state: "synced" });
    const result = await requestSignOut({ accountId: "user-a", client, storage, confirmDiscard: confirm });
    expect(confirm).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "signed_out", unresolved: 0 });
  });

  it("cuenta todos los estados sin resolver, incluidos los que el contador anterior omitía", async () => {
    const { storage, client } = setup();
    for (const [i, state] of STATES.entries())
      await storage.enqueueOperation("user-a", op(i + 1, "user-a", { state }));
    await storage.enqueueOperation("user-a", op(20));
    await storage.updateOperation("user-a", id(20), { state: "synced" });
    expect(unresolvedOperations(await storage.getQueue("user-a"))).toHaveLength(STATES.length);
    const confirm = vi.fn(async () => false);
    await requestSignOut({ accountId: "user-a", client, storage, confirmDiscard: confirm });
    expect(confirm).toHaveBeenCalledWith(STATES.length);
  });

  it("cancelar conserva la sesión, el token y los cambios", async () => {
    const { storage, client } = setup();
    await storage.enqueueOperation("user-a", op(1));
    await storage.saveBookings("user-a", [{ id: "bk" }]);
    const result = await requestSignOut({
      accountId: "user-a",
      client,
      storage,
      confirmDiscard: async () => false,
    });
    expect(result).toEqual({ status: "cancelled", unresolved: 1 });
    expect(client.signOut).not.toHaveBeenCalled();
    expect(client.getToken()).toBe("token-a");
    expect(storage.accountState("user-a")).toBe("open");
    expect(await storage.getQueue("user-a")).toHaveLength(1);
    expect((await storage.loadBookings("user-a"))?.data).toEqual([{ id: "bk" }]);
  });

  it("confirmar borra los privados de la cuenta sin afectar a datos públicos ni a otra cuenta", async () => {
    const { storage, client } = setup();
    await storage.enqueueOperation("user-a", op(1));
    await storage.enqueueOperation("user-b", op(2, "user-b"));
    await storage.saveDirectory({ businesses: [{ id: "pub" }] });
    await storage.saveBusinessProfile("pub", { name: "Público" });
    const result = await requestSignOut({
      accountId: "user-a",
      client,
      storage,
      confirmDiscard: async () => true,
    });
    expect(result).toMatchObject({ status: "signed_out", unresolved: 1, purged: true });
    expect(await storage.getQueue("user-a")).toEqual([]);
    expect(await storage.getQueue("user-b")).toHaveLength(1);
    expect((await storage.loadDirectory())?.data.businesses).toEqual([{ id: "pub" }]);
    expect((await storage.loadBusinessProfile("pub"))?.data).toEqual({ name: "Público" });
  });

  it("un fallo de purga tras confirmar no informa éxito", async () => {
    const { storage, client } = setup();
    await storage.enqueueOperation("user-a", op(1));
    vi.spyOn(storage, "clearAccount").mockRejectedValue(new Error("disco"));
    const result = await requestSignOut({
      accountId: "user-a",
      client,
      storage,
      confirmDiscard: async () => true,
    });
    expect(result.status).toBe("purge_failed");
  });

  it("un fallo al leer la cola no descarta a ciegas", async () => {
    const { storage, client } = setup();
    vi.spyOn(storage, "getQueue").mockRejectedValue(new Error("lectura"));
    await expect(
      requestSignOut({ accountId: "user-a", client, storage, confirmDiscard: async () => true }),
    ).rejects.toThrow("lectura");
    expect(client.signOut).not.toHaveBeenCalled();
    expect(client.getToken()).toBe("token-a");
  });

  it("los textos de la advertencia existen en los seis idiomas, con el número de cambios", () => {
    expect(MOBILE_LANGUAGES.map((l) => l.lang).sort()).toEqual(["de", "en", "es", "fr", "it", "pt"]);
    const keys = [
      "signOutPendingTitle",
      "signOutPendingBody",
      "signOutDiscard",
      "signOutCancel",
      "signOutUnrevoked",
      "signOutFailed",
    ];
    for (const { lang } of MOBILE_LANGUAGES) {
      for (const key of keys) {
        expect(typeof MOBILE_STRINGS[lang][key], `${lang}.${key}`).toBe("string");
        expect(MOBILE_STRINGS[lang][key].trim().length, `${lang}.${key}`).toBeGreaterThan(0);
      }
      expect(MOBILE_STRINGS[lang].signOutPendingBody).toContain("{count}");
      // Cada idioma tiene su propio texto: ninguno es copia del español.
      if (lang !== "es")
        expect(MOBILE_STRINGS[lang].signOutDiscard).not.toBe(MOBILE_STRINGS.es.signOutDiscard);
    }
  });
});

describe("una comprobación en vuelo no resucita la sesión (M05)", () => {
  const USER = { id: "user-a", email: "a@example.com", name: "Ana" };
  const SUMMARY = { user: USER, org: null, calendars: [] };

  async function refreshing(overrides = {}) {
    const { storage, client } = setup();
    await storage.saveSession({ token: "token-a", user: USER });
    const gate = deferred();
    client.panelSummary = vi.fn(() => gate.promise);
    client.myBookings = vi.fn(async () => []);
    Object.assign(client, overrides);
    return { storage, client, gate };
  }

  it("refresca los datos de la sesión guardada", async () => {
    const { storage, client, gate } = await refreshing();
    client.setToken(null);
    const pending = refreshCachedSession({ client, storage });
    gate.resolve(SUMMARY);
    await expect(pending).resolves.toEqual({ status: "refreshed", summary: SUMMARY, bookings: [] });
    expect(client.getToken()).toBe("token-a");
    expect((await storage.loadSummary("user-a"))?.data).toEqual(SUMMARY);
  });

  it("una respuesta tardía tras salir no devuelve token, sesión ni datos", async () => {
    const { storage, client, gate } = await refreshing();
    const pending = refreshCachedSession({ client, storage });
    await until(() => client.panelSummary.mock.calls.length > 0);
    await signOutAccount({ accountId: "user-a", client, storage });
    gate.resolve(SUMMARY);
    await expect(pending).resolves.toEqual({ status: "stale" });
    expect(client.getToken()).toBeNull();
    expect(await storage.loadSession()).toBeNull();
    expect(await storage.loadSummary("user-a")).toBeNull();
  });

  it("no restaura el token de una cuenta que empezó a salir", async () => {
    const { storage, client } = await refreshing();
    client.setToken(null);
    storage.beginExit("user-a");
    await expect(refreshCachedSession({ client, storage })).resolves.toEqual({ status: "stale" });
    expect(client.getToken()).toBeNull();
    expect(client.panelSummary).not.toHaveBeenCalled();
  });

  it("guardar la sesión de una cuenta cerrada se descarta hasta el siguiente acceso", async () => {
    const { storage } = await refreshing();
    await storage.clearSession();
    await storage.clearAccount("user-a");
    await storage.saveSession({ token: "token-a", user: USER });
    expect(await storage.loadSession()).toBeNull();
    storage.openAccount("user-a");
    await storage.saveSession({ token: "token-a2", user: USER });
    expect((await storage.loadSession())?.session.token).toBe("token-a2");
  });

  it("un 401 tardío de la sesión anterior no cierra la sesión nueva", async () => {
    const { storage, client, gate } = await refreshing();
    const pending = refreshCachedSession({ client, storage });
    await until(() => client.panelSummary.mock.calls.length > 0);
    client.setToken("token-b");
    gate.reject({ status: 401 });
    await expect(pending).resolves.toEqual({ status: "stale" });
    expect(client.getToken()).toBe("token-b");
    expect(await storage.loadSession()).not.toBeNull();
  });

  it("no pisa una sesión más reciente del cliente", async () => {
    const { storage, client } = await refreshing();
    client.setToken("token-b");
    await expect(refreshCachedSession({ client, storage })).resolves.toEqual({ status: "stale" });
    expect(client.getToken()).toBe("token-b");
  });

  it("401 invalida la sesión y un fallo de red se propaga sin borrarla", async () => {
    const rejected = await refreshing();
    const invalid = refreshCachedSession({ client: rejected.client, storage: rejected.storage });
    await until(() => rejected.client.panelSummary.mock.calls.length > 0);
    rejected.gate.reject({ status: 401 });
    await expect(invalid).resolves.toEqual({ status: "invalidated" });
    expect(rejected.client.getToken()).toBeNull();
    expect(await rejected.storage.loadSession()).toBeNull();

    const down = await refreshing();
    const failing = refreshCachedSession({ client: down.client, storage: down.storage });
    await until(() => down.client.panelSummary.mock.calls.length > 0);
    down.gate.reject({ status: 0, code: "network" });
    await expect(failing).rejects.toMatchObject({ code: "network" });
    expect(await down.storage.loadSession()).not.toBeNull();
  });
});
