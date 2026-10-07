import { createHmac, randomUUID } from "node:crypto";
import { type APIRequestContext, expect } from "@playwright/test";
import { actor } from "../fixtures/actores";
import { After, Given, sitio, Then, When } from "../fixtures/sitio";

const CAPTURA = process.env.CAPTURA_URL ?? "http://localhost:4010";
/** Secreto de webhook de la imitación de Stripe (sin valor real; ver services/api/src/billing/stripe.config.ts). */
const WHSEC = "whsec_falsa_de_pruebas";

async function modo(request: APIRequestContext, mode: "fake" | "off") {
  const res = await request.post(`${sitio.es}/api/__test/billing`, { data: { mode } });
  expect(res.status(), await res.text()).toBe(201);
}

After({ tags: "@stripe" }, async ({ request }) => {
  await modo(request, "off");
  await request.post(`${sitio.es}/api/__test/clock`, { data: { now: "2026-09-14T12:00:00Z" } });
});

Given("la facturación usa el Stripe de pruebas", async ({ request }) => {
  await modo(request, "fake");
});

async function facturacion(api: APIRequestContext) {
  const res = await api.get("/api/v1/billing");
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as { enabled: boolean; status: string; plan: string; trialEndsAt: string | null };
}

Then(
  "la facturación de {string} está apagada y su prueba no tiene fecha de fin",
  async ({ estado }, nombre: string) => {
    const b = await facturacion(actor(estado, nombre).api);
    expect(b.enabled).toBe(false);
    expect(b.status).toBe("trialing");
    expect(b.trialEndsAt).toBeNull();
  },
);

When("{string} abre la página de facturación", async ({ page, estado }, nombre: string) => {
  const a = actor(estado, nombre);
  await page.context().addCookies((await a.api.storageState()).cookies);
  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "script") scripts.push(r.url());
  });
  estado.scripts = scripts;
  const res = await page.goto(
    `${sitio[a.dominio]}${a.dominio === "es" ? "/panel/facturacion" : "/dashboard/billing"}`,
  );
  estado.csp = res?.headers()["content-security-policy"] ?? "";
  await page.waitForLoadState("networkidle");
});

Then("ve el botón «Disponible pronto» desactivado", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Disponible pronto" }).first()).toBeDisabled();
});

Then("la página no carga ningún script de Stripe", ({ estado }) => {
  expect((estado.scripts as string[]).filter((u) => u.includes("stripe.com"))).toEqual([]);
  expect(String(estado.csp)).not.toContain("stripe");
});

When("{string} contrata el plan {string}", async ({ estado }, nombre: string, plan: string) => {
  const res = await actor(estado, nombre).api.post("/api/v1/billing/checkout", { data: { plan } });
  expect(res.status(), await res.text()).toBe(201);
  estado.checkout = await res.json();
});

async function capturasStripe(request: APIRequestContext, path: string) {
  const res = await request.get(`${CAPTURA}/__requests?path=${encodeURIComponent(path)}`);
  return (await res.json()) as Array<{ body: Record<string, string> }>;
}

Then("Stripe recibe un pago integrado con los días de prueba restantes", async ({ request, estado }) => {
  expect((estado.checkout as { clientSecret: string }).clientSecret).toMatch(/secret/);
  const sesiones = await capturasStripe(request, "/v1/checkout/sessions");
  const ultima = sesiones.at(-1)?.body ?? {};
  expect(ultima.ui_mode).toBe("embedded");
  expect(ultima.mode).toBe("subscription");
  expect(Number(ultima["subscription_data[trial_end]"])).toBeGreaterThan(Date.now() / 1000 + 25 * 86_400);
});

async function orgDe(api: APIRequestContext) {
  return (await (await api.get("/api/v1/org")).json()) as { id: string };
}

/** Firma como Stripe: t=…,v1=HMAC-SHA256(secreto, "t.cuerpo"). */
async function webhook(request: APIRequestContext, evento: Record<string, unknown>) {
  const body = JSON.stringify(evento);
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", WHSEC).update(`${t}.${body}`).digest("hex");
  return request.post(`${sitio.es}/api/webhooks/stripe`, {
    headers: { "stripe-signature": `t=${t},v1=${v1}`, "content-type": "application/json" },
    data: body,
  });
}

async function suscripcion(
  request: APIRequestContext,
  estado: Record<string, unknown>,
  nombre: string,
  status: string,
  plan: string,
) {
  const a = actor(estado, nombre);
  const org = await orgDe(a.api);
  // El cliente de Stripe se crea al contratar.
  if (!estado.customer) {
    await a.api.post("/api/v1/billing/checkout", { data: { plan } });
    const clientes = (await (await request.get(`${CAPTURA}/__stripe/customers`)).json()) as Array<{
      id: string;
      metadata: { org_id: string };
    }>;
    estado.customer = clientes.find((c) => c.metadata.org_id === org.id)?.id;
  }
  const res = await request.post(`${CAPTURA}/__stripe/subscriptions`, {
    data: {
      id: estado.subId,
      customer: estado.customer,
      status,
      lookup_key: `${plan}_monthly_usd`,
      org_id: org.id,
    },
  });
  const sub = (await res.json()) as { id: string };
  estado.subId = sub.id;
  return sub;
}

When(
  "Stripe confirma la suscripción {string} de {string} con el plan {string}",
  async ({ request, estado }, status: string, nombre: string, plan: string) => {
    const sub = await suscripcion(request, estado, nombre, status, plan);
    const evento = {
      id: `evt_${randomUUID()}`,
      object: "event",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: "cs_x", object: "checkout.session", subscription: sub.id } },
    };
    estado.evento = evento;
    const res = await webhook(request, evento);
    expect(res.status(), await res.text()).toBe(200);
    expect(((await res.json()) as { duplicate: boolean }).duplicate).toBe(false);
  },
);

Given(
  "{string} tiene la suscripción {string} con el plan {string}",
  async ({ request, estado }, nombre: string, status: string, plan: string) => {
    const sub = await suscripcion(request, estado, nombre, status, plan);
    const res = await webhook(request, {
      id: `evt_${randomUUID()}`,
      object: "event",
      type: "customer.subscription.created",
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: sub.id, object: "subscription" } },
    });
    expect(res.status(), await res.text()).toBe(200);
  },
);

When("Stripe reenvía el mismo evento", async ({ request, estado }) => {
  const res = await webhook(request, estado.evento as Record<string, unknown>);
  expect(res.status()).toBe(200);
  estado.reenvio = await res.json();
});

Then("el reenvío no tiene efectos", ({ estado }) => {
  expect((estado.reenvio as { duplicate: boolean }).duplicate).toBe(true);
});

Then(
  "la organización de {string} está {string} con el plan {string}",
  async ({ request, estado }, nombre: string, status: string, plan: string) => {
    await expect
      .poll(
        async () => {
          await request.post(`${sitio.es}/api/__test/tick`);
          const b = await facturacion(actor(estado, nombre).api);
          return `${b.status}/${b.plan}`;
        },
        { timeout: 15_000 },
      )
      .toBe(`${status}/${plan}`);
  },
);

When("Stripe avisa de un pago fallido de {string}", async ({ request, estado }, nombre: string) => {
  const sub = await suscripcion(request, estado, nombre, "past_due", "personal");
  const res = await webhook(request, {
    id: `evt_${randomUUID()}`,
    object: "event",
    type: "invoice.payment_failed",
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: "in_x", object: "invoice", subscription: sub.id } },
  });
  expect(res.status(), await res.text()).toBe(200);
});

When(
  "llega tarde un evento viejo de suscripción {string} de {string}",
  async ({ request, estado }, viejo: string, _nombre: string) => {
    // El evento trae un estado antiguo, pero api vuelve a leer la suscripción (que sigue activa).
    const res = await webhook(request, {
      id: `evt_${randomUUID()}`,
      object: "event",
      type: "customer.subscription.updated",
      created: Math.floor(Date.now() / 1000) - 3600,
      data: { object: { id: estado.subId, object: "subscription", status: viejo } },
    });
    expect(res.status(), await res.text()).toBe(200);
  },
);

When("pasan {int} días", async ({ request }, dias: number) => {
  await request.post(`${sitio.es}/api/__test/clock`, {
    data: { now: new Date(Date.now() + dias * 86_400_000).toISOString() },
  });
  await request.post(`${sitio.es}/api/__test/tick`);
});

Then("el tablero no acepta reservas", async ({ request, estado }) => {
  const t = estado.tablero as { slug: string };
  const perfil = (await (await request.get(`${sitio.es}/api/public/v1/calendars/${t.slug}`)).json()) as {
    bookable: boolean;
    services: Array<{ id: string }>;
  };
  expect(perfil.bookable).toBe(false);
  const hold = await request.post(`${sitio.es}/api/public/v1/calendars/${t.slug}/holds`, {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      serviceId: perfil.services[0]?.id,
      start: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      attendee: { name: "Ana", email: `ana-${randomUUID().slice(0, 6)}@escenarios.test` },
    },
  });
  expect(hold.status()).toBe(409);
  expect(await hold.text()).toContain("calendar_unavailable");
});

When("{string} cambia al plan {string}", async ({ estado }, nombre: string, plan: string) => {
  const res = await actor(estado, nombre).api.post("/api/v1/billing/change-plan", { data: { plan } });
  estado.status = res.status();
  estado.body = await res.text();
});

When(
  "{string} archiva el tablero actual y cambia al plan {string}",
  async ({ estado }, nombre: string, plan: string) => {
    const a = actor(estado, nombre);
    const t = estado.tablero as { id: string };
    const arch = await a.api.post(`/api/v1/calendars/${t.id}/archive`, { data: { archived: true } });
    expect(arch.status(), await arch.text()).toBeLessThan(300);
    const res = await a.api.post("/api/v1/billing/change-plan", { data: { plan } });
    expect(res.status(), await res.text()).toBe(201);
  },
);
