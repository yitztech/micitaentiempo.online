import { randomUUID } from "node:crypto";
import { type APIRequestContext, expect, request as pwRequest } from "@playwright/test";
import { actor } from "../fixtures/actores";
import { esperarCorreo } from "../fixtures/correo";
import { Given, sitio, Then, When } from "../fixtures/sitio";

// Los escenarios usan un tablero en Ciudad de México (UTC−6 todo el año).
const instante = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-06:00`).toISOString();

interface Visitante {
  nombre: string;
  email: string;
  api: APIRequestContext;
  holdId?: string;
  holdToken?: string;
  token?: string;
  citaId?: string;
}

function visitantes(estado: Record<string, unknown>): Record<string, Visitante> {
  estado.visitantes ??= {};
  return estado.visitantes as Record<string, Visitante>;
}

function visitante(estado: Record<string, unknown>, nombre: string): Visitante {
  const v = visitantes(estado)[nombre];
  if (!v) throw new Error(`Visitante desconocida: ${nombre}`);
  return v;
}

const tablero = (estado: Record<string, unknown>) => estado.tablero as { id: string; slug: string };
const servicio = (estado: Record<string, unknown>) => (estado.servicio as { id: string }).id;
const duena = (estado: Record<string, unknown>) => actor(estado, String(estado.propietario));

async function nuevaVisitante(estado: Record<string, unknown>, nombre: string): Promise<Visitante> {
  const existente = visitantes(estado)[nombre];
  if (existente) return existente;
  const v: Visitante = {
    nombre,
    email: `${nombre.toLowerCase()}-${randomUUID().slice(0, 8)}@escenarios.test`,
    api: await pwRequest.newContext({ baseURL: sitio.es, extraHTTPHeaders: { Origin: sitio.es } }),
  };
  visitantes(estado)[nombre] = v;
  return v;
}

async function apartar(estado: Record<string, unknown>, nombre: string, fecha: string, hora: string) {
  const v = await nuevaVisitante(estado, nombre);
  const res = await v.api.post(`/api/public/v1/calendars/${tablero(estado).slug}/holds`, {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      serviceId: servicio(estado),
      start: instante(fecha, hora),
      attendee: { name: nombre, email: v.email, timezone: "America/Mexico_City" },
    },
  });
  estado.status = res.status();
  estado.body = await res.text();
  if (res.status() === 201) {
    const body = JSON.parse(String(estado.body)) as { hold: { id: string }; holdToken: string };
    v.holdId = body.hold.id;
    v.holdToken = body.holdToken;
  }
  return res.status();
}

async function verificarCorreo(request: APIRequestContext, v: Visitante) {
  const envio = await v.api.post("/api/public/v1/otp/send", { data: { email: v.email } });
  expect(envio.status(), await envio.text()).toBe(204);
  const correo = await esperarCorreo(request, v.email);
  const codigo = correo.text.match(/\b\d{6}\b/)?.[0];
  expect(codigo, correo.text).toBeTruthy();
  const res = await v.api.post("/api/public/v1/otp/verify", {
    data: { email: v.email, code: codigo, name: v.nombre },
  });
  expect(res.status(), await res.text()).toBe(201);
  v.token = ((await res.json()) as { token: string }).token;
  expect(v.token).toBeTruthy();
  // El embed usa el token Bearer; un contexto sin cookies comprueba que basta con él.
  v.api = await pwRequest.newContext({
    baseURL: sitio.es,
    extraHTTPHeaders: { Authorization: `Bearer ${v.token}` },
  });
}

async function confirmar(v: Visitante) {
  const res = await v.api.post(`/api/public/v1/holds/${v.holdId}/confirm`, {
    data: { holdToken: v.holdToken },
  });
  expect(res.status(), await res.text()).toBe(201);
  const body = (await res.json()) as { id: string; status: string };
  v.citaId = body.id;
  return body;
}

async function libres(estado: Record<string, unknown>, fecha: string) {
  const res = await pwRequest.newContext({ baseURL: sitio.es }).then((api) =>
    api.get(`/api/public/v1/calendars/${tablero(estado).slug}/availability`, {
      params: { service: servicio(estado), from: instante(fecha, "00:00"), to: instante(fecha, "23:59") },
    }),
  );
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { slots: Array<{ start: string }> }).slots.map((s) => s.start);
}

When(
  "la visitante {string} aparta el {string} a las {string}",
  async ({ estado }, nombre: string, fecha: string, hora: string) => {
    expect(await apartar(estado, nombre, fecha, hora), String(estado.body)).toBe(201);
  },
);

When(
  "la visitante {string} intenta apartar el {string} a las {string}",
  async ({ estado }, nombre: string, fecha: string, hora: string) => {
    await apartar(estado, nombre, fecha, hora);
  },
);

Then("el horario queda apartado", ({ estado }) => {
  expect(estado.status, String(estado.body)).toBe(201);
  expect(JSON.parse(String(estado.body)).hold.status).toBe("held");
});

Then("el {string} a las {string} no aparece libre", async ({ estado }, fecha: string, hora: string) => {
  expect(await libres(estado, fecha)).not.toContain(instante(fecha, hora));
});

Then("el {string} a las {string} aparece libre", async ({ estado }, fecha: string, hora: string) => {
  expect(await libres(estado, fecha)).toContain(instante(fecha, hora));
});

When("{string} pide un código a su correo y lo escribe", async ({ request, estado }, nombre: string) => {
  await verificarCorreo(request, visitante(estado, nombre));
});

When("{string} confirma su reserva", async ({ estado }, nombre: string) => {
  estado.confirmada = await confirmar(visitante(estado, nombre));
});

Then("la reserva de {string} queda confirmada", ({ estado }, _nombre: string) => {
  expect((estado.confirmada as { status: string }).status).toBe("confirmed");
});

Given(
  "la clienta {string} tiene una cita el {string} a las {string}",
  async ({ request, estado }, nombre: string, fecha: string, hora: string) => {
    expect(await apartar(estado, nombre, fecha, hora), String(estado.body)).toBe(201);
    const v = visitante(estado, nombre);
    await verificarCorreo(request, v);
    expect((await confirmar(v)).status).toBe("confirmed");
  },
);

async function eventosDelTablero(estado: Record<string, unknown>, incluirCanceladas = false) {
  const res = await duena(estado).api.get(`/api/v1/calendars/${tablero(estado).id}/events`, {
    params: {
      from: "2026-09-01T00:00:00Z",
      to: "2026-12-31T00:00:00Z",
      includeCancelled: String(incluirCanceladas),
    },
  });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as Array<{
    id: string;
    kind: string;
    status: string;
    start: string;
    attendee: { email: string | null } | null;
    recurrence: { seriesId: string } | null;
  }>;
}

Then("{string} ve la cita de {string} en su tablero", async ({ estado }, _duena: string, nombre: string) => {
  const v = visitante(estado, nombre);
  const evs = await eventosDelTablero(estado);
  expect(evs).toContainEqual(expect.objectContaining({ id: v.citaId, status: "confirmed" }));
  expect(evs.find((e) => e.id === v.citaId)?.attendee?.email).toBe(v.email);
});

async function misCitas(v: Visitante) {
  const res = await v.api.get("/api/public/v1/my/bookings");
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as Array<{ id: string; calendar: { name: string } }>;
}

Then(/^"([^"]+)" ve (\d+) citas? en «Mis citas»$/, async ({ estado }, nombre: string, n: string) => {
  const citas = await misCitas(visitante(estado, nombre));
  expect(citas).toHaveLength(Number(n));
  for (const c of citas) expect(c.calendar.name).toBe("Consultas");
});

When("{string} intenta cancelar la cita de {string}", async ({ estado }, nombre: string, otra: string) => {
  const res = await visitante(estado, nombre).api.post(
    `/api/public/v1/my/bookings/${visitante(estado, otra).citaId}/cancel`,
    { data: {} },
  );
  estado.status = res.status();
  estado.body = await res.text();
});

When("{string} intenta crear una serie semanal en el tablero", async ({ estado }, nombre: string) => {
  const res = await visitante(estado, nombre).api.post(`/api/v1/calendars/${tablero(estado).id}/events`, {
    data: { serviceId: servicio(estado), start: instante("2026-09-22", "10:00"), rrule: "FREQ=WEEKLY" },
  });
  estado.status = res.status();
  estado.body = await res.text();
});

When("{string} cancela su cita", async ({ estado }, nombre: string) => {
  const v = visitante(estado, nombre);
  const res = await v.api.post(`/api/public/v1/my/bookings/${v.citaId}/cancel`, {
    data: { reason: "Imprevisto" },
  });
  expect(res.status(), await res.text()).toBe(201);
});

When(
  "{string} crea la serie {string} desde el {string} a las {string}",
  async ({ estado }, nombre: string, rrule: string, fecha: string, hora: string) => {
    const res = await actor(estado, nombre).api.post(`/api/v1/calendars/${tablero(estado).id}/events`, {
      data: { serviceId: servicio(estado), start: instante(fecha, hora), rrule, title: "Terapia" },
    });
    expect(res.status(), await res.text()).toBe(201);
    estado.serie = await res.json();
  },
);

Then("la serie tiene {int} fechas", ({ estado }, n: number) => {
  expect((estado.serie as { instances: number }).instances).toBe(n);
});

When(
  "{string} mueve la fecha {int} y las siguientes a las {string}",
  async ({ estado }, nombre: string, n: number, hora: string) => {
    const evs = (await eventosDelTablero(estado)).filter((e) => e.recurrence);
    const objetivo = evs[n - 1];
    if (!objetivo) throw new Error(`No hay fecha ${n}`);
    const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(
      new Date(objetivo.start),
    );
    const res = await actor(estado, nombre).api.patch(
      `/api/v1/calendars/${tablero(estado).id}/events/${objetivo.id}`,
      {
        data: { scope: "following", start: instante(fecha, hora) },
      },
    );
    expect(res.status(), await res.text()).toBe(200);
  },
);

Then(
  "hay {int} fechas a las {string} y {int} a las {string}",
  async ({ estado }, a: number, horaA: string, b: number, horaB: string) => {
    const horas = (await eventosDelTablero(estado))
      .filter((e) => e.recurrence)
      .map((e) =>
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "America/Mexico_City",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(e.start)),
      );
    expect(horas.filter((h) => h === horaA)).toHaveLength(a);
    expect(horas.filter((h) => h === horaB)).toHaveLength(b);
  },
);

When(
  "{string} bloquea el {string} de {string} a {string} cancelando las citas",
  async ({ estado }, nombre: string, fecha: string, de: string, a: string) => {
    const res = await actor(estado, nombre).api.post(`/api/v1/calendars/${tablero(estado).id}/events`, {
      data: {
        kind: "block",
        title: "Mantenimiento",
        start: instante(fecha, de),
        end: instante(fecha, a),
        cancelOverlapping: true,
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    estado.bloqueo = await res.json();
  },
);

Then("la cita de {string} queda cancelada", async ({ estado }, nombre: string) => {
  const v = visitante(estado, nombre);
  const ev = (await eventosDelTablero(estado, true)).find((e) => e.id === v.citaId);
  expect(ev?.status).toBe("cancelled");
  expect(await misCitas(v)).toHaveLength(0);
});

Then(
  "no hay horarios libres el {string} entre {string} y {string}",
  async ({ estado }, fecha: string, de: string, a: string) => {
    const desde = Date.parse(instante(fecha, de));
    const hasta = Date.parse(instante(fecha, a));
    const dentro = (await libres(estado, fecha)).filter(
      (s) => Date.parse(s) >= desde && Date.parse(s) < hasta,
    );
    expect(dentro).toEqual([]);
  },
);

When("pasan {int} minutos", async ({ request }, n: number) => {
  const res = await request.post(`${sitio.es}/api/__test/clock`, {
    data: { now: new Date(Date.parse("2026-09-14T12:00:00Z") + n * 60_000).toISOString() },
  });
  expect(res.status()).toBe(201);
});
