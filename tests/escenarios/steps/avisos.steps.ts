import { randomUUID } from "node:crypto";
import { type APIRequestContext, expect } from "@playwright/test";
import { actor, actores, CLAVE, nuevoContexto } from "../fixtures/actores";
import { enlace, esperarCorreo } from "../fixtures/correo";
import { Given, sitio, Then, When } from "../fixtures/sitio";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const CAPTURA = process.env.CAPTURA_URL ?? "http://localhost:4010";
const SECRETO_TELEGRAM = process.env.TELEGRAM_WEBHOOK_SECRET ?? "ci-telegram-webhook-secret-00000000000000";

const tablero = (estado: Record<string, unknown>) => estado.tablero as { id: string; slug: string };

function correoDe(estado: Record<string, unknown>, nombre: string): string {
  const a = (estado.actores as Record<string, { email: string }> | undefined)?.[nombre];
  const v = (estado.visitantes as Record<string, { email: string }> | undefined)?.[nombre];
  const email = a?.email ?? v?.email;
  if (!email) throw new Error(`Sin correo para ${nombre}`);
  return email;
}

async function asuntos(request: APIRequestContext, para: string): Promise<string[]> {
  const res = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${para}"`)}`);
  const { messages } = (await res.json()) as { messages: Array<{ Subject: string }> };
  return messages.map((m) => m.Subject);
}

/** El worker de avisos corre cada 2 s; además se fuerza una pasada. */
async function procesar(request: APIRequestContext) {
  await request.post(`${sitio.es}/api/__test/tick`);
}

Given(
  "{string} es observadora del tablero con su cuenta en inglés",
  async ({ request, estado }, nombre: string) => {
    const duena = actor(estado, String(estado.propietario));
    const email = `${nombre.toLowerCase()}-${randomUUID().slice(0, 8)}@escenarios.test`;
    const inv = await duena.api.post(`/api/v1/calendars/${tablero(estado).id}/invitations`, {
      data: { email, role: "observer" },
    });
    expect(inv.status(), await inv.text()).toBe(201);
    const token = ((await inv.json()) as { token: string }).token;
    const api = await nuevoContexto("en");
    const alta = await api.post("/api/auth/sign-up/email", {
      data: { name: nombre, email, password: CLAVE },
    });
    expect(alta.status(), await alta.text()).toBe(200);
    await api.get(
      enlace(await esperarCorreo(request, email, { asunto: /Confirm/ }), "/api/auth/verify-email"),
      { maxRedirects: 0 },
    );
    expect((await api.post("/api/auth/sign-in/email", { data: { email, password: CLAVE } })).status()).toBe(
      200,
    );
    const acepta = await api.post(`/api/v1/invitations/${token}/accept`);
    expect(acepta.status(), await acepta.text()).toBe(200);
    actores(estado)[nombre] = { nombre, email, dominio: "en", api };
  },
);

Then(
  "{string} recibe un correo con el asunto {string}",
  async ({ request, estado }, nombre: string, asunto: string) => {
    const para = correoDe(estado, nombre);
    await expect
      .poll(
        async () => {
          await procesar(request);
          return (await asuntos(request, para)).some((s) => s.includes(asunto));
        },
        { timeout: 30_000 },
      )
      .toBe(true);
  },
);

Then(
  "{string} recibe exactamente {int} correo con el asunto {string}",
  async ({ request, estado }, nombre: string, n: number, asunto: string) => {
    const para = correoDe(estado, nombre);
    await expect
      .poll(
        async () => {
          await procesar(request);
          return (await asuntos(request, para)).filter((s) => s.includes(asunto)).length;
        },
        { timeout: 30_000 },
      )
      .toBe(n);
    // Y no llega ninguno más tras unas pasadas del worker.
    await new Promise((r) => setTimeout(r, 4_000));
    await procesar(request);
    expect((await asuntos(request, para)).filter((s) => s.includes(asunto))).toHaveLength(n);
  },
);

Then("{string} no recibe correos de avisos", async ({ request, estado }, nombre: string) => {
  await new Promise((r) => setTimeout(r, 4_000));
  await procesar(request);
  const s = await asuntos(request, correoDe(estado, nombre));
  expect(s.filter((x) => x.startsWith("Aviso de") || x.startsWith("Update from"))).toEqual([]);
});

Then(
  "{string} no recibe un correo con el asunto {string}",
  async ({ request, estado }, nombre: string, asunto: string) => {
    await new Promise((r) => setTimeout(r, 3_000));
    await procesar(request);
    expect((await asuntos(request, correoDe(estado, nombre))).filter((s) => s.includes(asunto))).toEqual([]);
  },
);

Then("{string} recibe la confirmación con el archivo .ics", async ({ request, estado }, nombre: string) => {
  const para = correoDe(estado, nombre);
  await expect
    .poll(
      async () => {
        await procesar(request);
        return (await asuntos(request, para)).includes("Tu cita está confirmada");
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  const correo = await esperarCorreo(request, para, { asunto: /Tu cita está confirmada/ });
  expect(correo.attachments.some((a) => a.fileName.endsWith(".ics"))).toBe(true);
});

Then(
  "{string} tiene en su panel el aviso {string}",
  async ({ request, estado }, nombre: string, texto: string) => {
    const api = actor(estado, nombre).api;
    await expect
      .poll(
        async () => {
          await procesar(request);
          const res = (await (await api.get("/api/v1/notifications")).json()) as {
            items: Array<{ type: string; params: { customer?: string } }>;
          };
          return res.items.some(
            (n) => n.type === "booking.created" && texto.startsWith(n.params.customer ?? "—"),
          );
        },
        { timeout: 30_000 },
      )
      .toBe(true);
  },
);

// ── Telegram ──

When(
  "{string} vincula Telegram con el chat {int}",
  async ({ request, estado }, nombre: string, chat: number) => {
    const res = await actor(estado, nombre).api.post("/api/v1/channels/telegram/link");
    expect(res.status(), await res.text()).toBe(201);
    const { token, url } = (await res.json()) as { token: string; url: string };
    expect(url).toContain(`?start=${token}`);
    const hook = await request.post(`${sitio.es}/api/webhooks/telegram`, {
      headers: { "X-Telegram-Bot-Api-Secret-Token": SECRETO_TELEGRAM },
      data: {
        update_id: 1,
        message: {
          message_id: 1,
          text: `/start ${token}`,
          chat: { id: chat, type: "private", first_name: nombre },
        },
      },
    });
    expect(hook.status(), await hook.text()).toBe(200);
  },
);

async function capturas(request: APIRequestContext, path: string) {
  const res = await request.get(`${CAPTURA}/__requests?path=${encodeURIComponent(path)}`);
  return (await res.json()) as Array<{ path: string; body: Record<string, unknown> }>;
}

Then("el bot confirma la vinculación en el chat {int}", async ({ request }, chat: number) => {
  await expect
    .poll(async () =>
      (await capturas(request, "/telegram/")).some(
        (r) => r.body.chat_id === String(chat) && String(r.body.text).includes("Mi Cita en Tiempo"),
      ),
    )
    .toBe(true);
});

Then(
  "el chat {int} recibe un aviso que contiene {string}",
  async ({ request }, chat: number, texto: string) => {
    await expect
      .poll(
        async () => {
          await procesar(request);
          return (await capturas(request, "/telegram/")).some(
            (r) => r.body.chat_id === String(chat) && String(r.body.text).includes(texto),
          );
        },
        { timeout: 30_000 },
      )
      .toBe(true);
  },
);

// ── WhatsApp ──

When(
  "{string} verifica su WhatsApp {string}",
  async ({ request, estado }, nombre: string, telefono: string) => {
    const api = actor(estado, nombre).api;
    const envio = await api.post("/api/v1/channels/whatsapp/verify", { data: { phone: telefono } });
    expect(envio.status(), await envio.text()).toBe(204);
    const to = telefono.replace("+", "");
    const msg = (await capturas(request, "/whatsapp/")).reverse().find((r) => r.body.to === to);
    const template = msg?.body.template as
      | { name: string; components: Array<{ parameters: Array<{ text: string }> }> }
      | undefined;
    expect(template?.name).toBe("mcet_codigo");
    const codigo = template?.components[0]?.parameters[0]?.text ?? "";
    const ok = await api.post("/api/v1/channels/whatsapp/confirm", { data: { code: codigo } });
    expect(ok.status(), await ok.text()).toBe(201);
  },
);

Then(
  "WhatsApp recibe la plantilla {string} para {string}",
  async ({ request }, plantilla: string, to: string) => {
    await expect
      .poll(
        async () => {
          await procesar(request);
          return (await capturas(request, "/whatsapp/")).some(
            (r) => r.body.to === to && (r.body.template as { name: string }).name === plantilla,
          );
        },
        { timeout: 30_000 },
      )
      .toBe(true);
  },
);

// ── Slack ──

When("{string} conecta Slack", async ({ request, estado }, nombre: string) => {
  const api = actor(estado, nombre).api;
  const install = await api.get("/api/v1/integrations/slack/install", { maxRedirects: 0 });
  expect(install.status()).toBe(302);
  const autorizar = await request.get(String(install.headers().location), { maxRedirects: 0 });
  expect(autorizar.status()).toBe(302);
  const vuelta = await api.get(String(autorizar.headers().location), { maxRedirects: 0 });
  expect(vuelta.headers().location).toContain("slack=ok");
  estado.slackDesde = Date.now();
});

Then("Slack recibe un aviso que contiene {string}", async ({ request }, texto: string) => {
  await expect
    .poll(
      async () => {
        await procesar(request);
        return (await capturas(request, "/slack/hook/")).some((r) => String(r.body.text).includes(texto));
      },
      { timeout: 30_000 },
    )
    .toBe(true);
});

// ── Baja de un clic ──

When("{string} se da de baja desde el enlace del correo", async ({ request, estado }, nombre: string) => {
  const correo = await esperarCorreo(request, correoDe(estado, nombre), { asunto: /Aviso de/ });
  const url = enlace(correo, "/api/public/v1/unsubscribe");
  // RFC 8058: el cliente de correo hace POST a la URL de List-Unsubscribe.
  const res = await request.post(url);
  expect(res.status(), await res.text()).toBe(200);
});

When("se procesan los avisos", async ({ request }) => {
  await procesar(request);
  await procesar(request);
});
