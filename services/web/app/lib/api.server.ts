import { request as httpRequest } from "node:http";

const BASE = new URL(process.env.API_INTERNAL_URL ?? "http://api:3000");

export interface ApiResponse<T> {
  status: number;
  body: T | null;
}

/**
 * Llama a `api` desde el servidor conservando el Host del visitante (idioma y sesión por dominio) y
 * su cookie. Usa node:http porque fetch no permite fijar Host.
 */
export function apiGet<T>(request: Request, path: string): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    host: request.headers.get("host") ?? BASE.host,
    accept: "application/json",
  };
  const cookie = request.headers.get("cookie");
  if (cookie) headers.cookie = cookie;
  const realIp = request.headers.get("x-real-ip");
  if (realIp) headers["x-real-ip"] = realIp;
  return new Promise((resolve) => {
    const req = httpRequest(
      { host: BASE.hostname, port: BASE.port || 80, path, method: "GET", headers, timeout: 5_000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          let body: T | null = null;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
          } catch {
            body = null;
          }
          resolve({ status: res.statusCode ?? 502, body });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => resolve({ status: 502, body: null }));
    req.end();
  });
}

export interface Features {
  google: boolean;
  microsoft: boolean;
  stripe: boolean;
  slack: boolean;
  telegram: boolean;
  whatsapp: boolean;
  newsletter: { es: boolean; en: boolean };
}

const NONE: Features = {
  google: false,
  microsoft: false,
  stripe: false,
  slack: false,
  telegram: false,
  whatsapp: false,
  newsletter: { es: false, en: false },
};

let cached: { at: number; value: Features } | undefined;

/** Integraciones configuradas en `api` (caché de 60 s; si `api` no responde, todo desactivado). */
export async function features(request: Request): Promise<Features> {
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  const res = await apiGet<Features>(request, "/api/public/v1/features");
  if (res.status === 200 && res.body) {
    cached = { at: Date.now(), value: res.body };
    return res.body;
  }
  return cached?.value ?? NONE;
}
