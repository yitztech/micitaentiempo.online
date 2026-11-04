import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { PrivateBusinessProfile } from "../../../packages/schemas/dist/index.js";
import { createMobileClient } from "../../../services/mobile/src/index.ts";
import { actor, CLAVE } from "../fixtures/actores";
import { sitio, Then, When } from "../fixtures/sitio";

type Cliente = ReturnType<typeof createMobileClient>;
type Sedes = { items: Array<{ id: string; version: number; location: { name: string } }> };
type Perfil = Awaited<ReturnType<Cliente["assignCalendarLocation"]>>;
type EstadoSedes = { cliente: Cliente; sedeId?: string; asignado?: { anterior: number; perfil: Perfil } };

function sedes(estado: Record<string, unknown>): EstadoSedes {
  return estado.sedesMovil as EstadoSedes;
}

function tableroId(estado: Record<string, unknown>): string {
  return (estado.tablero as { id: string }).id;
}

async function versionPerfil(cliente: Cliente): Promise<number> {
  return (await cliente.getOwnerBusinessProfile()).version;
}

async function listar(estado: Record<string, unknown>, nombre: string): Promise<Sedes["items"]> {
  const res = await actor(estado, nombre).api.get("/api/business-profile/locations");
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as Sedes).items;
}

When("{string} entra con el cliente móvil", async ({ estado }, nombre: string) => {
  const a = actor(estado, nombre);
  const cliente = createMobileClient({ baseUrl: sitio[a.dominio], platform: "android" });
  const sesion = await cliente.signIn({ email: a.email, password: CLAVE });
  expect(sesion.token).toBeTruthy();
  estado.sedesMovil = { cliente } satisfies EstadoSedes;
});

When(
  "{string} crea la sede {string} con el cliente móvil",
  async ({ estado }, _nombre: string, sede: string) => {
    const s = sedes(estado);
    const creada = await s.cliente.addBusinessLocation(
      {
        name: sede,
        country: "MX",
        region: "CDMX",
        locality: "Ciudad de México",
        address: "Av. Reforma 1",
        postalCode: "06000",
        addressVisibility: "public",
        latitude: null,
        longitude: null,
      },
      await versionPerfil(s.cliente),
      randomUUID(),
    );
    s.sedeId = creada.id;
  },
);

Then("la API lista la sede {string} de {string}", async ({ estado }, sede: string, nombre: string) => {
  const items = await listar(estado, nombre);
  expect(items.map((item) => item.location.name)).toEqual([sede]);
  expect(items[0]?.id).toBe(sedes(estado).sedeId);
});

When("{string} asigna la sede al tablero con el cliente móvil", async ({ estado }, _nombre: string) => {
  const s = sedes(estado);
  const anterior = await versionPerfil(s.cliente);
  const perfil = await s.cliente.assignCalendarLocation(
    tableroId(estado),
    s.sedeId ?? null,
    anterior,
    randomUUID(),
  );
  s.asignado = { anterior, perfil };
});

Then("la API confirma el perfil con una versión nueva", async ({ estado }) => {
  const { anterior, perfil } = sedes(estado).asignado ?? {};
  expect(PrivateBusinessProfile.safeParse(perfil).success).toBe(true);
  expect(perfil?.version).toBeGreaterThan(Number(anterior));
});

When("{string} quita la sede del tablero con el cliente móvil", async ({ estado }, _nombre: string) => {
  const s = sedes(estado);
  await s.cliente.assignCalendarLocation(
    tableroId(estado),
    null,
    await versionPerfil(s.cliente),
    randomUUID(),
  );
});

When("{string} borra la sede con el cliente móvil", async ({ estado }, _nombre: string) => {
  const s = sedes(estado);
  await s.cliente.deleteBusinessLocation(String(s.sedeId), await versionPerfil(s.cliente), randomUUID());
});

Then("la API no lista sedes de {string}", async ({ estado }, nombre: string) => {
  expect(await listar(estado, nombre)).toEqual([]);
});
