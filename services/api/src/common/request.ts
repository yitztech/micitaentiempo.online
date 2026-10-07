import { type Lang, langForHost } from "@mcet/i18n";
import type { FastifyRequest } from "fastify";
import type { Env } from "../config/env.js";

/** El idioma de cada petición lo decide el Host (README). */
export function requestLang(req: Pick<FastifyRequest, "headers">, env: Env): Lang {
  return langForHost(req.headers.host, env.site);
}

/** Convierte las cabeceras de Fastify en Headers de Fetch. */
export function toHeaders(raw: FastifyRequest["headers"]): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, String(value));
  }
  return headers;
}
