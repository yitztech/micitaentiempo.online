import { randomUUID } from "node:crypto";
import { type APIRequestContext, expect } from "@playwright/test";
import { actor } from "../fixtures/actores";
import { Given, sitio, Then, When } from "../fixtures/sitio";

const CAPTURA = process.env.CAPTURA_URL ?? "http://localhost:4010";
const RADICALE = process.env.RADICALE_URL ?? "http://localhost:5232";
const instante = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-06:00`).toISOString();
const tablero = (estado: Record<string, unknown>) => estado.tablero as { id: string; slug: string };
const duena = (estado: Record<string, unknown>) => actor(estado, String(estado.propietario)).api;

// ── Feeds ──

When("{string} crea un enlace ICS {string}", async ({ estado }, nombre: string, scope: string) => {
  const res = await actor(estado, nombre).api.post(`/api/v1/calendars/${tablero(estado).id}/feeds`, {
    data: { scope },
  });
  expect(res.status(), await res.text()).toBe(201);
  const feed = (await res.json()) as { id: string; url: string; webcal: string };
  expect(feed.webcal).toMatch(/^webcal:\/\//);
  estado.feed = feed;
});

async function leerFeed(request: APIRequestContext, estado: Record<string, unknown>) {
  const res = await request.get((estado.feed as { url: string }).url);
  return { status: res.status(), body: await res.text() };
}

Then("el enlace ICS incluye {string}", async ({ request, estado }, texto: string) => {
  const { status, body } = await leerFeed(request, estado);
  expect(status).toBe(200);
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain(texto);
});

Then("el enlace ICS no incluye {string}", async ({ request, estado }, texto: string) => {
  expect((await leerFeed(request, estado)).body).not.toContain(texto);
});

When("{string} revoca el enlace ICS", async ({ estado }, nombre: string) => {
  const f = estado.feed as { id: string };
  const res = await actor(estado, nombre).api.delete(`/api/v1/calendars/${tablero(estado).id}/feeds/${f.id}`);
  expect(res.status()).toBe(204);
});

Then("el enlace ICS ya no responde", async ({ request, estado }) => {
  expect((await leerFeed(request, estado)).status).toBe(404);
});

// ── Google y Outlook (OAuth contra la captura) ──

async function conexiones(api: APIRequestContext, id: string) {
  const res = await api.get(`/api/v1/calendars/${id}/integrations`);
  expect(res.status(), await res.text()).toBe(200);
  return (
    (await res.json()) as {
      connections: Array<{ id: string; account: string; status: string; provider: string }>;
    }
  ).connections;
}

When(
  "{string} conecta {string} al tablero",
  async ({ request, estado }, nombre: string, proveedor: string) => {
    const api = actor(estado, nombre).api;
    const inicio = await api.get(`/api/v1/integrations/${proveedor}/connect?calendar=${tablero(estado).id}`, {
      maxRedirects: 0,
    });
    expect(inicio.status(), await inicio.text()).toBe(302);
    const autorizar = await request.get(String(inicio.headers().location), { maxRedirects: 0 });
    expect(autorizar.status()).toBe(302);
    const vuelta = await api.get(String(autorizar.headers().location), { maxRedirects: 0 });
    expect(vuelta.headers().location).toContain("sync=ok");
    const conn = (await conexiones(api, tablero(estado).id)).find((c) => c.provider === proveedor);
    expect(conn?.status).toBe("active");
    estado.conexion = conn;
  },
);

async function resync(estado: Record<string, unknown>) {
  const c = estado.conexion as { id: string };
  await duena(estado).post(`/api/v1/calendars/${tablero(estado).id}/integrations/${c.id}/resync`);
}

When(
  "el calendario conectado tiene ocupado el {string} de {string} a {string}",
  async ({ request, estado }, fecha: string, de: string, a: string) => {
    const c = estado.conexion as { account: string };
    await request.post(`${CAPTURA}/__prov/busy`, {
      data: { account: c.account, start: instante(fecha, de), end: instante(fecha, a) },
    });
    await resync(estado);
  },
);

Then(
  "los horarios del {string} no incluyen las {string} ni las {string}",
  async ({ request, estado }, fecha: string, h1: string, h2: string) => {
    const perfil = (await (
      await request.get(`${sitio.es}/api/public/v1/calendars/${tablero(estado).slug}`)
    ).json()) as { services: Array<{ id: string }> };
    const res = await request.get(
      `${sitio.es}/api/public/v1/calendars/${tablero(estado).slug}/availability`,
      {
        params: {
          service: perfil.services[0]?.id ?? "",
          from: instante(fecha, "00:00"),
          to: instante(fecha, "23:59"),
        },
      },
    );
    const libres = ((await res.json()) as { slots: Array<{ start: string }> }).slots.map((s) => s.start);
    expect(libres).toContain(instante(fecha, "09:00"));
    expect(libres).not.toContain(instante(fecha, h1));
    expect(libres).not.toContain(instante(fecha, h2));
  },
);

async function eventosExternos(request: APIRequestContext, estado: Record<string, unknown>) {
  const c = estado.conexion as { account: string };
  return (await (
    await request.get(`${CAPTURA}/__prov/events?account=${encodeURIComponent(c.account)}`)
  ).json()) as Array<{
    summary?: string;
    subject?: string;
    start: { dateTime: string };
  }>;
}

Then(
  "la cita de {string} aparece en el calendario conectado",
  async ({ request, estado }, nombre: string) => {
    await expect
      .poll(
        async () =>
          (await eventosExternos(request, estado)).some((e) => `${e.summary ?? e.subject}`.includes(nombre)),
        { timeout: 20_000 },
      )
      .toBe(true);
  },
);

When(
  "alguien mueve la cita en el calendario conectado al {string} a las {string}",
  async ({ request, estado }, fecha: string, hora: string) => {
    const c = estado.conexion as { account: string };
    const fin = new Date(Date.parse(instante(fecha, hora)) + 30 * 60_000).toISOString();
    await request.post(`${CAPTURA}/__prov/move`, {
      data: { account: c.account, start: instante(fecha, hora), end: fin },
    });
    await resync(estado);
  },
);

Then(
  "la cita vuelve al {string} a las {string} en el calendario conectado",
  async ({ request, estado }, fecha: string, hora: string) => {
    await expect
      .poll(
        async () =>
          (await eventosExternos(request, estado)).map((e) =>
            new Date(
              e.start.dateTime.endsWith("Z") ? e.start.dateTime : `${e.start.dateTime}Z`,
            ).toISOString(),
          ),
        { timeout: 20_000 },
      )
      .toContain(instante(fecha, hora));
  },
);

When("el proveedor revoca el acceso", async ({ request, estado }) => {
  const c = estado.conexion as { account: string };
  await request.post(`${CAPTURA}/__prov/revoke`, { data: { account: c.account } });
  await resync(estado);
});

Then("la conexión queda desconectada", async ({ estado }) => {
  const c = estado.conexion as { id: string };
  await expect
    .poll(
      async () => (await conexiones(duena(estado), tablero(estado).id)).find((x) => x.id === c.id)?.status,
      { timeout: 15_000 },
    )
    .toBe("revoked");
});

Then("{string} tiene un aviso de calendario desconectado", async ({ request, estado }, nombre: string) => {
  await expect
    .poll(
      async () => {
        await request.post(`${sitio.es}/api/__test/tick`);
        const res = (await (await actor(estado, nombre).api.get("/api/v1/notifications")).json()) as {
          items: Array<{ type: string }>;
        };
        return res.items.some((n) => n.type === "sync.revoked");
      },
      { timeout: 30_000 },
    )
    .toBe(true);
});

// ── iCloud con Radicale ──

function basic(user: string) {
  return { Authorization: `Basic ${Buffer.from(`${user}:contrasena-de-app`).toString("base64")}` };
}

Given(
  "un calendario de iCloud con un evento el {string} de {string} a {string}",
  async ({ request, estado }, fecha: string, de: string, a: string) => {
    const user = `icloud-${randomUUID().slice(0, 8)}`;
    estado.icloud = user;
    const mk = await request.fetch(`${RADICALE}/${user}/agenda/`, {
      method: "MKCALENDAR",
      headers: { ...basic(user), "Content-Type": "application/xml" },
      data: `<?xml version="1.0"?><C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:set><D:prop><D:displayname>Agenda</D:displayname></D:prop></D:set></C:mkcalendar>`,
    });
    expect(mk.status(), await mk.text()).toBeLessThan(300);
    const z = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//pruebas//",
      "BEGIN:VEVENT",
      `UID:${randomUUID()}`,
      `DTSTAMP:${z(new Date().toISOString())}`,
      `DTSTART:${z(instante(fecha, de))}`,
      `DTEND:${z(instante(fecha, a))}`,
      "SUMMARY:Dentista",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    const put = await request.put(`${RADICALE}/${user}/agenda/dentista.ics`, {
      headers: { ...basic(user), "Content-Type": "text/calendar" },
      data: ics,
    });
    expect(put.status(), await put.text()).toBeLessThan(300);
  },
);

When("{string} conecta iCloud con una contraseña de app", async ({ estado }, nombre: string) => {
  const res = await actor(estado, nombre).api.post(
    `/api/v1/calendars/${tablero(estado).id}/integrations/icloud`,
    {
      data: { appleId: estado.icloud, appPassword: "contrasena-de-app" },
    },
  );
  expect(res.status(), await res.text()).toBe(201);
  const c = (await res.json()) as {
    id: string;
    status: string;
    calendars: Array<{ name: string; useAsBusy: boolean; writeTarget: boolean }>;
  };
  expect(c.status).toBe("active");
  expect(c.calendars.some((x) => x.useAsBusy && x.writeTarget)).toBe(true);
  estado.conexion = c;
});

Then(
  "la cita de {string} aparece en el calendario de iCloud",
  async ({ request, estado }, nombre: string) => {
    const user = String(estado.icloud);
    await expect
      .poll(
        async () =>
          (
            await (await request.get(`${RADICALE}/${user}/agenda/`, { headers: basic(user) })).text()
          ).includes(nombre),
        { timeout: 20_000 },
      )
      .toBe(true);
  },
);
