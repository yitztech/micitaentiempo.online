import { randomUUID } from "node:crypto";
import { type APIRequestContext, expect, request as pwRequest } from "@playwright/test";
import { enlace, esperarCorreo } from "./correo";
import { type Idioma, sitio } from "./sitio";

export const CLAVE = "una-clave-bien-larga-2026";

export interface Actor {
  nombre: string;
  email: string;
  dominio: Idioma;
  api: APIRequestContext;
  orgId?: string;
}

/** Contexto HTTP propio (cookies separadas) para cada actor del escenario. */
export async function nuevoContexto(dominio: Idioma): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: sitio[dominio], extraHTTPHeaders: { Origin: sitio[dominio] } });
}

/** Registra, verifica el correo y deja la sesión abierta. */
export async function registrar(
  correoApi: APIRequestContext,
  nombre: string,
  dominio: Idioma,
  email = `${nombre.toLowerCase().replace(/\W+/g, "-")}-${randomUUID().slice(0, 8)}@escenarios.test`,
): Promise<Actor> {
  const api = await nuevoContexto(dominio);
  const alta = await api.post("/api/auth/sign-up/email", { data: { name: nombre, email, password: CLAVE } });
  expect(alta.status(), await alta.text()).toBe(200);
  const correo = await esperarCorreo(correoApi, email);
  await api.get(enlace(correo, "/api/auth/verify-email"), { maxRedirects: 0 });
  const login = await api.post("/api/auth/sign-in/email", { data: { email, password: CLAVE } });
  expect(login.status(), await login.text()).toBe(200);
  return { nombre, email, dominio, api };
}

export function actores(estado: Record<string, unknown>): Record<string, Actor> {
  estado.actores ??= {};
  return estado.actores as Record<string, Actor>;
}

export function actor(estado: Record<string, unknown>, nombre: string): Actor {
  const a = actores(estado)[nombre];
  if (!a) throw new Error(`Actor desconocido: ${nombre}`);
  return a;
}
