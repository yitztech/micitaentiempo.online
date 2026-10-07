import { expect } from "@playwright/test";
import { actor, actores, CLAVE, nuevoContexto, registrar } from "../fixtures/actores";
import { enlace, esperarCorreo } from "../fixtures/correo";
import { Given, idioma, sitio, Then, When } from "../fixtures/sitio";

async function guardar(estado: Record<string, unknown>, res: import("@playwright/test").APIResponse) {
  estado.status = res.status();
  estado.body = await res.text();
}

Given(
  "un propietario {string} con plan {string} en el dominio {string}",
  async ({ request, estado }, nombre: string, plan: string, dominio: string) => {
    const a = await registrar(request, nombre, idioma(dominio));
    const org = await a.api.post("/api/v1/org", { data: { name: `Negocio de ${nombre}`, plan } });
    expect(org.status(), await org.text()).toBe(201);
    a.orgId = ((await org.json()) as { id: string }).id;
    actores(estado)[nombre] = a;
  },
);

async function crearTablero(
  estado: Record<string, unknown>,
  nombre: string,
  tablero: string,
  zona: string,
  pais: string,
) {
  const res = await actor(estado, nombre).api.post("/api/v1/calendars", {
    data: { name: tablero, timezone: zona, country: pais },
  });
  await guardar(estado, res);
  if (res.status() === 201) estado.tablero = JSON.parse(String(estado.body));
  return res.status();
}

When(
  "{string} crea el tablero {string} en {string} del país {string}",
  async ({ estado }, nombre: string, tablero: string, zona: string, pais: string) => {
    await crearTablero(estado, nombre, tablero, zona, pais);
  },
);

Given(
  "{string} tiene el tablero {string} en {string} del país {string}",
  async ({ estado }, nombre: string, tablero: string, zona: string, pais: string) => {
    expect(await crearTablero(estado, nombre, tablero, zona, pais)).toBe(201);
    estado.propietario = nombre;
  },
);

When("{string} crea {int} tableros", async ({ estado }, nombre: string, n: number) => {
  const codes: number[] = [];
  for (let i = 1; i <= n; i++)
    codes.push(await crearTablero(estado, nombre, `Sucursal ${i}`, "America/Mexico_City", "MX"));
  estado.codigos = codes;
});

Then("todos se crearon", ({ estado }) => {
  expect(estado.codigos).toEqual(Array((estado.codigos as number[]).length).fill(201));
});

Then("el tablero tiene un enlace público {string}", ({ estado }, slug: string) => {
  expect((estado.tablero as { slug: string }).slug.startsWith(slug)).toBe(true);
});

function tablero(estado: Record<string, unknown>) {
  return estado.tablero as { id: string };
}
function propietario(estado: Record<string, unknown>) {
  return actor(estado, String(estado.propietario));
}

Given(
  "el tablero abre de lunes a viernes de {string} a {string} con comida de {string} a {string}",
  async ({ estado }, abre: string, cierra: string, comeDe: string, comeA: string) => {
    const shifts = [1, 2, 3, 4, 5].flatMap((weekday) => [
      { weekday, kind: "open", range: { start: abre, end: cierra } },
      { weekday, kind: "break", label: "Comida", range: { start: comeDe, end: comeA } },
    ]);
    const res = await propietario(estado).api.put(`/api/v1/calendars/${tablero(estado).id}/hours`, {
      data: { shifts },
    });
    expect(res.status(), await res.text()).toBe(200);
  },
);

Given("el tablero bloquea los feriados públicos de {string}", async ({ estado }, pais: string) => {
  const res = await propietario(estado).api.put(`/api/v1/calendars/${tablero(estado).id}/holidays`, {
    data: { policies: [{ country: pais, types: ["public"] }] },
  });
  expect(res.status(), await res.text()).toBe(200);
});

Given(
  "el tablero tiene el servicio {string} de {int} minutos",
  async ({ estado }, nombre: string, min: number) => {
    const res = await propietario(estado).api.post(`/api/v1/calendars/${tablero(estado).id}/services`, {
      data: { name: { es: nombre }, durationMin: min, slotStepMin: min },
    });
    expect(res.status(), await res.text()).toBe(201);
    estado.servicio = await res.json();
  },
);

Given("la fecha actual es {string}", async ({ request }, iso: string) => {
  const res = await request.post(`${sitio.es}/api/__test/clock`, { data: { now: iso } });
  expect(res.status()).toBe(201);
});

When(
  "{string} consulta los horarios del {string} al {string}",
  async ({ estado }, nombre: string, desde: string, hasta: string) => {
    const a = actor(estado, nombre);
    const from = `${desde}T06:00:00Z`;
    const to = new Date(new Date(`${hasta}T06:00:00Z`).getTime() + 86_400_000).toISOString();
    const res = await a.api.get(`/api/v1/calendars/${tablero(estado).id}/availability`, {
      params: { service: (estado.servicio as { id: string }).id, from, to },
    });
    expect(res.status(), await res.text()).toBe(200);
    const { slots } = (await res.json()) as { slots: Array<{ start: string }> };
    const porDia: Record<string, number> = {};
    for (const s of slots) {
      const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(
        new Date(s.start),
      );
      porDia[dia] = (porDia[dia] ?? 0) + 1;
    }
    estado.porDia = porDia;
    const hol = await a.api.get(`/api/v1/calendars/${tablero(estado).id}/holidays`, {
      params: { from: desde, to: hasta },
    });
    estado.feriados = await hol.json();
  },
);

Then("hay {int} horarios el {string}", ({ estado }, n: number, dia: string) => {
  expect((estado.porDia as Record<string, number>)[dia] ?? 0).toBe(n);
});

Then("no hay horarios el {string}", ({ estado }, dia: string) => {
  expect((estado.porDia as Record<string, number>)[dia] ?? 0).toBe(0);
});

Then("el día {string} figura como {string}", ({ estado }, dia: string, nombre: string) => {
  expect(estado.feriados).toContainEqual(expect.objectContaining({ date: dia, name: nombre }));
});

When(
  "{string} invita a {string} como {string}",
  async ({ estado }, nombre: string, invitado: string, rol: string) => {
    const email = `${invitado.toLowerCase()}-${Date.now()}@escenarios.test`;
    const res = await actor(estado, nombre).api.post(`/api/v1/calendars/${tablero(estado).id}/invitations`, {
      data: { email, role: rol },
    });
    expect(res.status(), await res.text()).toBe(201);
    estado.invitado = { nombre: invitado, email };
  },
);

Then("{string} recibe la invitación en español", async ({ request, estado }, _invitado: string) => {
  const inv = estado.invitado as { email: string };
  const correo = await esperarCorreo(request, inv.email);
  expect(correo.subject).toContain("te invita a «Consultas»");
  estado.correoInvitacion = correo;
});

When(
  "{string} se registra con el correo invitado y acepta la invitación",
  async ({ request, estado }, nombre: string) => {
    const inv = estado.invitado as { email: string };
    const correo =
      (estado.correoInvitacion as Parameters<typeof enlace>[0]) ?? (await esperarCorreo(request, inv.email));
    const token = enlace(correo, "/invitacion/").split("/invitacion/")[1] ?? "";
    const a = await registrar(request, nombre, "es", inv.email);
    actores(estado)[nombre] = a;
    const res = await a.api.post(`/api/v1/invitations/${token}/accept`);
    await guardar(estado, res);
  },
);

Then("{string} ve el tablero con el rol {string}", async ({ estado }, nombre: string, rol: string) => {
  const res = await actor(estado, nombre).api.get(`/api/v1/calendars/${tablero(estado).id}`);
  expect(res.status()).toBe(200);
  expect(((await res.json()) as { role: string }).role).toBe(rol);
});

When("{string} intenta cambiar el horario del tablero", async ({ estado }, nombre: string) => {
  const res = await actor(estado, nombre).api.put(`/api/v1/calendars/${tablero(estado).id}/hours`, {
    data: { shifts: [] },
  });
  await guardar(estado, res);
});

When("{string} consulta el tablero de {string}", async ({ estado }, nombre: string, _duena: string) => {
  const res = await actor(estado, nombre).api.get(`/api/v1/calendars/${tablero(estado).id}`);
  await guardar(estado, res);
});

export { CLAVE, nuevoContexto };
