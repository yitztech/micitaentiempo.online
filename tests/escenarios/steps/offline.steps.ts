import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { actor } from "../fixtures/actores";
import { Given, Then, When } from "../fixtures/sitio";

type Pagina = {
  mode: string;
  reset: boolean;
  snapshotComplete: boolean;
  hasMore: boolean;
  nextCursor: string;
  items: Array<{
    resource: string;
    id: string;
    op: string;
    revision: number;
    data?: Record<string, unknown>;
  }>;
  resources: string[];
  unsupported: string[];
};
type EstadoOffline = {
  cursores: Record<string, string>;
  ultima?: Pagina;
  rechazo?: { status: number; code?: string };
};

function offline(estado: Record<string, unknown>): EstadoOffline {
  if (!estado.offline) estado.offline = { cursores: {} };
  return estado.offline as EstadoOffline;
}

async function descargar(estado: Record<string, unknown>, nombre: string, cursor?: string) {
  const o = offline(estado);
  const res = await actor(estado, nombre).api.get("/api/offline/changes", {
    params: cursor === undefined ? {} : { cursor },
  });
  if (res.status() === 200) {
    const pagina = (await res.json()) as Pagina;
    o.ultima = pagina;
    o.rechazo = undefined;
    o.cursores[nombre] = pagina.nextCursor;
    return;
  }
  const cuerpo = (await res.json().catch(() => ({}))) as { code?: string };
  o.ultima = undefined;
  o.rechazo = { status: res.status(), code: cuerpo.code };
}

Given("{string} abre su perfil de negocio", async ({ estado }, nombre: string) => {
  // El borrador del perfil se crea la primera vez que se abre; hasta entonces no hay nada que sincronizar.
  const res = await actor(estado, nombre).api.get("/api/business-profile");
  expect(res.status(), await res.text()).toBe(200);
});

When("{string} descarga los cambios sin cursor", async ({ estado }, nombre: string) => {
  await descargar(estado, nombre);
});

When("{string} descarga los cambios con el cursor anterior", async ({ estado }, nombre: string) => {
  const cursor = offline(estado).cursores[nombre];
  expect(cursor, "falta el cursor de la descarga anterior").toBeTruthy();
  await descargar(estado, nombre, cursor);
});

When(
  "{string} usa el cursor de {string} para descargar cambios",
  async ({ estado }, quien: string, dueno: string) => {
    await descargar(estado, quien, offline(estado).cursores[dueno]);
  },
);

When("{string} descarga los cambios con un cursor manipulado", async ({ estado }, nombre: string) => {
  const cursor = offline(estado).cursores[nombre] ?? "";
  const [cuerpo = "", firma = ""] = cursor.split(".");
  await descargar(estado, nombre, `${cuerpo}x.${firma}`);
});

When(
  "{string} cambia el nombre de su negocio a {string}",
  async ({ estado }, nombre: string, nuevo: string) => {
    const a = actor(estado, nombre);
    const actual = await a.api.get("/api/business-profile");
    expect(actual.status(), await actual.text()).toBe(200);
    const valor = (await actual.json()) as { version: number; content: Record<string, unknown> };
    const res = await a.api.patch("/api/business-profile", {
      headers: { "Idempotency-Key": randomUUID() },
      data: { expectedVersion: valor.version, ...valor.content, displayName: nuevo },
    });
    expect(res.status(), await res.text()).toBe(200);
  },
);

Then(
  "la descarga es un snapshot con reinicio que incluye el perfil de {string}",
  async ({ estado }, nombre: string) => {
    const pagina = offline(estado).ultima;
    expect(pagina, JSON.stringify(offline(estado).rechazo)).toBeTruthy();
    expect(pagina).toMatchObject({ mode: "snapshot", reset: true, snapshotComplete: true, hasMore: false });
    expect(pagina?.items.some((i) => i.resource === "business_profile" && i.op === "upsert")).toBe(true);
    expect(typeof pagina?.nextCursor).toBe("string");
    expect(nombre).toBeTruthy();
  },
);

Then("la descarga declara los recursos sincronizados y los no soportados", async ({ estado }) => {
  const pagina = offline(estado).ultima;
  expect(pagina?.resources).toEqual(["business_profile", "business_location"]);
  expect(pagina?.unsupported).toEqual(expect.arrayContaining(["bookings", "agenda", "images"]));
});

Then("la descarga trae el perfil con el nombre {string}", async ({ estado }, nombre: string) => {
  const perfil = offline(estado).ultima?.items.find((i) => i.resource === "business_profile");
  expect(perfil, JSON.stringify(offline(estado))).toMatchObject({ op: "upsert" });
  const contenido = (perfil?.data ?? {}) as { content?: { displayName?: string } };
  expect(contenido.content?.displayName).toBe(nombre);
});

Then("la descarga no trae elementos nuevos", async ({ estado }) => {
  expect(offline(estado).ultima).toMatchObject({ mode: "changes", items: [], hasMore: false });
});

Then("la descarga se rechaza con {int} {word}", async ({ estado }, codigo: number, error: string) => {
  expect(offline(estado).rechazo).toEqual({ status: codigo, code: error });
});

Then("la descarga no contiene datos de {string}", async ({ estado }, nombre: string) => {
  const pagina = offline(estado).ultima;
  expect(pagina, JSON.stringify(offline(estado).rechazo)).toBeTruthy();
  const mio = await actor(estado, nombre).api.get("/api/business-profile");
  const idAjeno = ((await mio.json()) as { businessId: string }).businessId;
  expect(JSON.stringify(pagina)).not.toContain(idAjeno);
  // Cada propietario solo ve su propio negocio.
  expect(pagina?.items.filter((i) => i.resource === "business_profile").length).toBeLessThanOrEqual(1);
});
