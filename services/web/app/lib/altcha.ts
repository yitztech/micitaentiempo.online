import { useCallback, useRef, useState } from "react";

export type AltchaState = "idle" | "verifying" | "verified" | "error";

const WORKERS = 4;

/** Pide un reto a `api` y lo resuelve en paralelo con Web Workers; devuelve la cabecera x-altcha. */
async function solve(): Promise<string> {
  const res = await fetch("/api/public/v1/altcha", { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`reto ${res.status}`);
  const challenge = await res.json();
  const n = Math.max(1, Math.min(WORKERS, navigator.hardwareConcurrency || 2));
  const workers = Array.from(
    { length: n },
    () => new Worker(new URL("./altcha.worker.ts", import.meta.url), { type: "module" }),
  );
  try {
    const solution = await Promise.any(
      workers.map(
        (w, i) =>
          new Promise((resolve, reject) => {
            w.onmessage = (e) => (e.data ? resolve(e.data) : reject(new Error("sin solución")));
            w.onerror = reject;
            w.postMessage({ challenge, start: i, step: n });
          }),
      ),
    );
    return btoa(JSON.stringify({ challenge, solution }));
  } finally {
    for (const w of workers) w.terminate();
  }
}

/**
 * Comprobación antibots ALTCHA (prueba de trabajo, sin terceros). `start()` empieza a resolver en
 * segundo plano (al tocar el formulario) y `token()` espera la solución al enviar. Cada solución
 * sirve una sola vez: tras usarla se pide otra.
 */
export function useAltcha() {
  const [state, setState] = useState<AltchaState>("idle");
  const pending = useRef<Promise<string> | null>(null);

  const start = useCallback(() => {
    if (pending.current) return pending.current;
    setState("verifying");
    const p = solve().then(
      (token) => {
        setState("verified");
        return token;
      },
      (err: unknown) => {
        pending.current = null;
        setState("error");
        throw err;
      },
    );
    pending.current = p;
    p.catch(() => undefined);
    return p;
  }, []);

  const token = useCallback(async () => {
    const t = await start();
    pending.current = null;
    setState("idle");
    return t;
  }, [start]);

  return { state, start, token };
}
