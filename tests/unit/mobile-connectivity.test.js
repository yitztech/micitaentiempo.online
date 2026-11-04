import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConnectivityController, submitOrQueue } from "../../services/mobile/src/connectivity.ts";
import { createMobileClient, isTransportError } from "../../services/mobile/src/index.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const json = (status, body = {}) => new Response(JSON.stringify(body), { status });

/** fetch que no responde nunca, pero respeta la cancelación como el real. */
function hangingFetch() {
  return vi.fn(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
  );
}

describe("cliente móvil: plazos y clasificación de errores", () => {
  it("un plazo vencido se convierte en error de transporte con código timeout y avisa", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const onTransportError = vi.fn();
    const client = createMobileClient({
      baseUrl: "https://api.test",
      platform: "ios",
      timeoutMs: 5000,
      onTransportError,
    });
    const pending = client.panelSummary().catch((e) => e);
    await vi.advanceTimersByTimeAsync(5000);
    const error = await pending;
    expect(error).toMatchObject({ status: 0, code: "timeout" });
    expect(isTransportError(error)).toBe(true);
    expect(onTransportError).toHaveBeenCalledTimes(1);
  });

  it("un fallo de red es transporte; 502/503/504 también; 401, 403, 409 y 422 no lo son", async () => {
    const onTransportError = vi.fn();
    const client = createMobileClient({ baseUrl: "https://api.test", platform: "android", onTransportError });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Network request failed"))),
    );
    expect(isTransportError(await client.panelSummary().catch((e) => e))).toBe(true);
    for (const status of [502, 503, 504]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => json(status)),
      );
      expect(isTransportError(await client.panelSummary().catch((e) => e))).toBe(true);
    }
    expect(onTransportError).toHaveBeenCalledTimes(4);
    onTransportError.mockClear();
    for (const status of [400, 401, 403, 404, 409, 422, 500]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => json(status, { code: "X" })),
      );
      const error = await client.panelSummary().catch((e) => e);
      expect(error).toMatchObject({ status, code: "x" });
      expect(isTransportError(error)).toBe(false);
    }
    expect(onTransportError).not.toHaveBeenCalled();
  });

  it("la cancelación pedida por quien llama no cuenta como falta de red", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const onTransportError = vi.fn();
    const client = createMobileClient({ baseUrl: "https://api.test", platform: "ios", onTransportError });
    const abort = new AbortController();
    const pending = client.bootstrap(abort.signal).catch((e) => e);
    abort.abort();
    const error = await pending;
    expect(error).toMatchObject({ status: 0, code: "aborted" });
    expect(isTransportError(error)).toBe(false);
    expect(onTransportError).not.toHaveBeenCalled();
  });

  it("una página de error no JSON no rompe el cliente y un éxito no JSON es inválido", async () => {
    const client = createMobileClient({ baseUrl: "https://api.test", platform: "ios" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>Bad Gateway</html>", { status: 500 })),
    );
    expect(await client.panelSummary().catch((e) => e)).toMatchObject({ status: 500, code: "generic" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>ok</html>", { status: 200 })),
    );
    expect(await client.panelSummary().catch((e) => e)).toMatchObject({
      status: 200,
      code: "invalid_response",
    });
  });
});

describe("controlador de conectividad", () => {
  function setup(probe) {
    const changes = [];
    const controller = createConnectivityController({
      probe,
      onChange: (s) => changes.push(s),
      intervalMs: 30_000,
    });
    return { controller, changes };
  }

  it("arrancar conectado, perder la red, guardar en cola y recuperar la red", async () => {
    let serverUp = false;
    const probe = vi.fn(async () => {
      if (!serverUp) throw { status: 0, code: "network", body: {} };
    });
    const { controller, changes } = setup(probe);
    controller.markConnected();
    expect(controller.state()).toBe("connected");

    // Una petición cualquiera falla por transporte: pasa a offline sin esperar a ninguna comprobación.
    controller.reportError({ status: 0, code: "timeout", body: {} });
    expect(controller.state()).toBe("offline");

    const queued = [];
    const saved = await submitOrQueue({
      isOnline: () => controller.state() === "connected",
      attempt: async () => {
        throw new Error("no debe enviarse sin conexión");
      },
      enqueue: async (id) => void queued.push(id),
      operationId: "op-1",
    });
    expect(saved).toEqual({ status: "queued" });
    expect(queued).toEqual(["op-1"]);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(controller.state()).toBe("offline");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(probe).toHaveBeenCalledTimes(2);

    serverUp = true;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(controller.state()).toBe("connected");
    expect(changes).toEqual(["connected", "offline", "connected"]);
    // Ya conectado no quedan temporizadores de reconexión.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("una respuesta 401 no se interpreta como falta de internet", () => {
    const { controller, changes } = setup(vi.fn());
    controller.markConnected();
    controller.reportError({ status: 401, code: "unauthenticated", body: {} });
    controller.reportError({ status: 409, code: "conflict", body: {} });
    expect(controller.state()).toBe("connected");
    expect(changes).toEqual(["connected"]);
  });

  it("API caída o red local sin salida: sigue offline y reintenta sin solaparse", async () => {
    let calls = 0;
    const probe = vi.fn(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10_000));
      throw { status: 503, code: "unavailable", body: {} };
    });
    const { controller } = setup(probe);
    controller.reportFailure();
    const a = controller.checkNow();
    const b = controller.checkNow();
    expect(a).toBe(b);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await a).toBe("offline");
    expect(calls).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("al volver a primer plano comprueba de inmediato", async () => {
    const probe = vi.fn(async () => {});
    const { controller } = setup(probe);
    controller.reportFailure();
    await controller.checkNow();
    expect(controller.state()).toBe("connected");
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("desmontar cancela la comprobación y no aplica respuestas antiguas", async () => {
    let received;
    const probe = vi.fn(
      (signal) =>
        new Promise((resolve) => {
          received = signal;
          setTimeout(resolve, 5000);
        }),
    );
    const { controller, changes } = setup(probe);
    controller.reportFailure();
    const pending = controller.checkNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(1);
    controller.stop();
    expect(received.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    await pending;
    controller.reportFailure();
    controller.markConnected();
    expect(changes).toEqual(["offline"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("si se detiene antes de empezar la comprobación, no se llega a hacer", async () => {
    const probe = vi.fn(async () => {});
    const { controller } = setup(probe);
    controller.reportFailure();
    const pending = controller.checkNow();
    controller.stop();
    await pending;
    expect(probe).not.toHaveBeenCalled();
  });

  it("un probe que lanza de forma síncrona no deja la comprobación atascada", async () => {
    const probe = vi.fn(() => {
      throw new Error("boom");
    });
    const { controller } = setup(probe);
    controller.reportFailure();
    await expect(controller.checkNow()).resolves.toBe("offline");
    await expect(controller.checkNow()).resolves.toBe("offline");
    expect(probe).toHaveBeenCalledTimes(2);
  });
});

describe("guardar en línea o encolar", () => {
  it("conectado, la red se cae durante el envío: se encola con la misma clave de idempotencia", async () => {
    const sent = [];
    const queued = [];
    const result = await submitOrQueue({
      isOnline: () => true,
      attempt: async (id) => {
        sent.push(id);
        throw { status: 0, code: "timeout", body: {} };
      },
      enqueue: async (id) => void queued.push(id),
      operationId: "op-77",
    });
    expect(result).toEqual({ status: "queued" });
    expect(sent).toEqual(["op-77"]);
    expect(queued).toEqual(["op-77"]);
  });

  it("las respuestas del servidor se propagan y no se encolan", async () => {
    for (const status of [401, 403, 409, 422]) {
      const enqueue = vi.fn();
      await expect(
        submitOrQueue({
          isOnline: () => true,
          attempt: async () => {
            throw { status, code: "x", body: {} };
          },
          enqueue,
          operationId: "op",
        }),
      ).rejects.toMatchObject({ status });
      expect(enqueue).not.toHaveBeenCalled();
    }
  });

  it("si el envío funciona, devuelve el valor y no encola", async () => {
    const enqueue = vi.fn();
    const result = await submitOrQueue({
      isOnline: () => true,
      attempt: async () => "ok",
      enqueue,
      operationId: "op",
    });
    expect(result).toEqual({ status: "sent", value: "ok" });
    expect(enqueue).not.toHaveBeenCalled();
  });
});
