import { isTransportError } from "./index.ts";

export type ConnState = "connecting" | "connected" | "offline";

export interface ConnectivityOptions {
  /**
   * Comprueba con el servidor (no con el estado del sistema operativo) que hay conexión y deja los datos listos.
   * Debe rechazar si no se puede llegar al servidor. Recibe una señal que se cancela al detener el controlador.
   */
  probe: (signal: AbortSignal) => Promise<void>;
  onChange: (state: ConnState) => void;
  /** Espera entre comprobaciones mientras no hay conexión. */
  intervalMs?: number;
}

export const RECONNECT_INTERVAL_MS = 30_000;

/**
 * Estado de conexión de la app, decidido solo por lo que responde el servidor:
 * - `reportFailure` (fallo de transporte de cualquier petición) pasa a `offline` y programa comprobaciones;
 * - `markConnected` lo marca el arranque o una comprobación correcta;
 * - una sola comprobación en vuelo a la vez (`checkNow`), también al volver a primer plano;
 * - tras `stop` no se vuelve a emitir ningún cambio ni se aplican resultados antiguos.
 */
export function createConnectivityController({
  probe,
  onChange,
  intervalMs = RECONNECT_INTERVAL_MS,
}: ConnectivityOptions) {
  let state: ConnState = "connecting";
  let stopped = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<ConnState> | null = null;
  let abort: AbortController | null = null;

  const set = (next: ConnState) => {
    if (stopped || state === next) return;
    state = next;
    onChange(next);
  };
  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const schedule = () => {
    clearTimer();
    if (stopped || state !== "offline") return;
    timer = setTimeout(() => {
      timer = null;
      void controller.checkNow();
    }, intervalMs);
  };

  const controller = {
    state: () => state,

    markConnected() {
      if (stopped) return;
      clearTimer();
      set("connected");
    },

    /** Una petición no llegó al servidor. Respuestas HTTP (401, 409…) no pasan por aquí. */
    reportFailure() {
      if (stopped) return;
      set("offline");
      if (!inFlight) schedule();
    },

    /** Usa el error de una petición: solo los fallos de transporte cambian el estado. */
    reportError(error: unknown) {
      if (isTransportError(error)) controller.reportFailure();
    },

    /** Comprobación inmediata (volver a primer plano, reintento manual). Nunca hay dos a la vez. */
    checkNow(): Promise<ConnState> {
      if (stopped) return Promise.resolve(state);
      if (inFlight) return inFlight;
      clearTimer();
      const mine = generation;
      abort = new AbortController();
      const signal = abort.signal;
      // `Promise.resolve().then` garantiza que `inFlight` se asigna antes de que pueda terminar la comprobación.
      const run = Promise.resolve().then(async (): Promise<ConnState> => {
        if (mine !== generation) return state;
        try {
          await probe(signal);
          if (mine === generation && !signal.aborted) set("connected");
        } catch {
          if (mine === generation && !signal.aborted) set("offline");
        } finally {
          if (mine === generation) {
            inFlight = null;
            abort = null;
            schedule();
          }
        }
        return state;
      });
      inFlight = run;
      return run;
    },

    stop() {
      stopped = true;
      generation++;
      clearTimer();
      abort?.abort();
      abort = null;
      inFlight = null;
    },
  };
  return controller;
}

export type OnlineOrQueueResult<T> = { status: "sent"; value: T } | { status: "queued" };

/**
 * Guarda en línea si hay conexión y, si no, encola. Si el envío falla por transporte (el resultado es incierto:
 * el servidor pudo haberlo aplicado) se encola con la MISMA clave de idempotencia para que el reintento no duplique.
 * Cualquier respuesta del servidor (401, 403, 409, 422…) se propaga sin encolar.
 */
export async function submitOrQueue<T>({
  isOnline,
  attempt,
  enqueue,
  operationId,
}: {
  isOnline: () => boolean;
  attempt: (operationId: string) => Promise<T>;
  enqueue: (operationId: string) => Promise<void>;
  operationId: string;
}): Promise<OnlineOrQueueResult<T>> {
  if (!isOnline()) {
    await enqueue(operationId);
    return { status: "queued" };
  }
  try {
    return { status: "sent", value: await attempt(operationId) };
  } catch (error) {
    if (!isTransportError(error)) throw error;
    await enqueue(operationId);
    return { status: "queued" };
  }
}
