// Servidor de captura (solo pruebas): imita lo mínimo de Telegram, Slack y WhatsApp y guarda lo recibido.
//   GET    /__requests?path=<prefijo>  → peticiones recibidas
//   DELETE /__requests                 → vaciar
//   POST   /__fail {"path": "...", "status": 403} → la siguiente petición a ese prefijo falla
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4010);
let requests = [];
const failures = new Map();

// ── Stripe (con estado): lo mínimo que usa api; los escenarios fijan el estado de cada suscripción. ──
const stripe = { n: 0, customers: new Map(), sessions: new Map(), subs: new Map(), invoices: new Map() };
const PRICES = [
  {
    id: "price_personal",
    object: "price",
    lookup_key: "personal_monthly_usd",
    unit_amount: 500,
    currency: "usd",
    active: true,
  },
  {
    id: "price_branches",
    object: "price",
    lookup_key: "branches_monthly_usd",
    unit_amount: 2000,
    currency: "usd",
    active: true,
  },
];
const sid = (p) => `${p}_${++stripe.n}${Date.now().toString(36)}`;
const list = (data) => ({ object: "list", data, has_more: false, url: "/v1/list" });
function subscription({
  id,
  customer,
  status = "active",
  lookup_key = "personal_monthly_usd",
  org_id,
  cancel_at_period_end = false,
  trial_end = null,
}) {
  const price = PRICES.find((p) => p.lookup_key === lookup_key) ?? PRICES[0];
  const prev = stripe.subs.get(id);
  const sub = {
    id: id ?? sid("sub"),
    object: "subscription",
    status,
    customer,
    metadata: { org_id: org_id ?? prev?.metadata?.org_id },
    cancel_at_period_end,
    trial_end,
    items: {
      object: "list",
      data: [
        {
          id: prev?.items.data[0].id ?? sid("si"),
          object: "subscription_item",
          price,
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        },
      ],
    },
  };
  stripe.subs.set(sub.id, sub);
  return sub;
}
// ── Google Calendar y Microsoft Graph (con estado por cuenta) ──
const prov = { n: 0, codes: new Map(), tokens: new Map(), refresh: new Map(), accounts: new Map() };
function account(name) {
  let a = prov.accounts.get(name);
  if (!a) {
    a = { name, busy: [], events: new Map(), revoked: false };
    prov.accounts.set(name, a);
  }
  return a;
}
const fakeJwt = (email) =>
  `e30.${Buffer.from(JSON.stringify({ email, preferred_username: email })).toString("base64url")}.x`;
function authorize(url, res, prefix) {
  const name =
    url.searchParams.get("login_hint") || `${prefix}-${++prov.n}${Date.now().toString(36)}@example.com`;
  account(name);
  const code = `codigo-${++prov.n}`;
  prov.codes.set(code, name);
  const back = new URL(url.searchParams.get("redirect_uri") ?? "http://localhost/");
  back.searchParams.set("code", code);
  back.searchParams.set("state", url.searchParams.get("state") ?? "");
  res.writeHead(302, { location: back.toString() });
  res.end();
}
function tokenEndpoint(form, res) {
  let name;
  if (form.grant_type === "authorization_code") name = prov.codes.get(form.code);
  else if (form.grant_type === "refresh_token") name = prov.refresh.get(form.refresh_token);
  const a = name ? account(name) : null;
  if (!a || a.revoked) return json(res, 400, { error: "invalid_grant" });
  const access = `acceso-${++prov.n}`;
  const refresh = form.refresh_token ?? `renovar-${++prov.n}`;
  prov.tokens.set(access, a.name);
  prov.refresh.set(refresh, a.name);
  return json(res, 200, {
    access_token: access,
    refresh_token: refresh,
    expires_in: 3600,
    token_type: "Bearer",
    id_token: fakeJwt(a.name),
  });
}
function bearer(req) {
  const name = prov.tokens.get(String(req.headers.authorization ?? "").replace("Bearer ", ""));
  const a = name ? account(name) : null;
  return a && !a.revoked ? a : null;
}
function fakeGoogle(req, url, body, res) {
  const p = url.pathname.replace("/google", "");
  if (p === "/authorize") return authorize(url, res, "google");
  if (p === "/token") return tokenEndpoint(body, res);
  const a = bearer(req);
  if (!a) return json(res, 401, { error: { code: 401 } });
  const q = p.replace("/calendar/v3", "");
  if (q === "/users/me/calendarList")
    return json(res, 200, {
      items: [{ id: a.name, summary: "Principal", primary: true, accessRole: "owner" }],
    });
  if (q === "/calendars" && req.method === "POST")
    return json(res, 200, { id: "app-cal", summary: body.summary });
  if (q === "/freeBusy") return json(res, 200, { calendars: { [a.name]: { busy: a.busy } } });
  if (q === "/calendars/app-cal/events/watch")
    return json(res, 200, { resourceId: "recurso", expiration: String(Date.now() + 7 * 86400000) });
  if (q === "/calendars/app-cal/events" && req.method === "POST") {
    const id = `g${++prov.n}`;
    const ev = { ...body, id, etag: `e${prov.n}` };
    a.events.set(id, ev);
    return json(res, 200, ev);
  }
  const m = q.match(/^\/calendars\/app-cal\/events\/(.+)$/);
  if (m) {
    const ev = a.events.get(m[1]);
    if (req.method === "DELETE") {
      a.events.delete(m[1]);
      res.writeHead(204);
      return res.end();
    }
    if (!ev) return json(res, 404, { error: { code: 404 } });
    if (req.method === "PUT") {
      const next = { ...body, id: m[1], etag: `e${++prov.n}` };
      a.events.set(m[1], next);
      return json(res, 200, next);
    }
    return json(res, 200, ev);
  }
  return json(res, 404, { error: { message: `Sin imitar: ${req.method} ${q}` } });
}
function fakeGraph(req, url, body, res) {
  const p = url.pathname;
  if (p === "/ms/authorize") return authorize(url, res, "outlook");
  if (p === "/ms/token") return tokenEndpoint(body, res);
  const a = bearer(req);
  if (!a) return json(res, 401, { error: { code: "InvalidAuthenticationToken" } });
  const q = p.replace("/graph", "");
  if (q === "/me/calendars" && req.method === "GET") {
    const cals = [{ id: "cal-principal", name: "Calendario", canEdit: true, isDefaultCalendar: true }];
    if (a.appCal) cals.push({ id: "cal-app", name: a.appCal, canEdit: true, isDefaultCalendar: false });
    return json(res, 200, { value: cals });
  }
  if (q === "/me/calendars" && req.method === "POST") {
    a.appCal = body.name;
    return json(res, 201, { id: "cal-app", name: body.name });
  }
  if (q.startsWith("/me/calendars/cal-principal/calendarView"))
    return json(res, 200, {
      value: a.busy.map((b) => ({
        start: { dateTime: b.start.replace("Z", ""), timeZone: "UTC" },
        end: { dateTime: b.end.replace("Z", ""), timeZone: "UTC" },
        showAs: "busy",
      })),
    });
  if (q === "/me/calendars/cal-app/events" && req.method === "POST") {
    const id = `m${++prov.n}`;
    const ev = { ...body, id, changeKey: `c${prov.n}` };
    a.events.set(id, ev);
    return json(res, 201, ev);
  }
  if (q === "/subscriptions")
    return json(res, 201, { id: `sub-${++prov.n}`, expirationDateTime: body.expirationDateTime });
  const m = q.match(/^\/me\/events\/([^?]+)/);
  if (m) {
    const ev = a.events.get(m[1]);
    if (req.method === "DELETE") {
      a.events.delete(m[1]);
      res.writeHead(204);
      return res.end();
    }
    if (!ev) return json(res, 404, { error: { code: "ErrorItemNotFound" } });
    if (req.method === "PATCH") {
      const next = { ...ev, ...body, changeKey: `c${++prov.n}` };
      a.events.set(m[1], next);
      return json(res, 200, next);
    }
    return json(res, 200, ev);
  }
  return json(res, 404, { error: { message: `Sin imitar: ${req.method} ${q}` } });
}

function fakeStripe(req, url, form, res) {
  const p = url.pathname;
  if (req.method === "POST" && p === "/v1/customers") {
    const c = {
      id: sid("cus"),
      object: "customer",
      email: form.email,
      metadata: { org_id: form["metadata[org_id]"] },
    };
    stripe.customers.set(c.id, c);
    return json(res, 200, c);
  }
  if (req.method === "GET" && p === "/v1/prices") {
    const keys = [...url.searchParams.entries()]
      .filter(([k]) => k.startsWith("lookup_keys"))
      .map(([, v]) => v);
    return json(res, 200, list(PRICES.filter((x) => keys.length === 0 || keys.includes(x.lookup_key))));
  }
  if (req.method === "POST" && p === "/v1/checkout/sessions") {
    const s = {
      id: sid("cs"),
      object: "checkout.session",
      client_secret: `${sid("cs")}_secret_prueba`,
      customer: form.customer,
      metadata: { org_id: form["metadata[org_id]"] },
      mode: form.mode,
      ui_mode: form.ui_mode,
      subscription: null,
      trial_end: form["subscription_data[trial_end]"] ?? null,
    };
    stripe.sessions.set(s.id, s);
    return json(res, 200, s);
  }
  const m = p.match(/^\/v1\/subscriptions\/([^/]+)$/);
  if (m) {
    const sub = stripe.subs.get(m[1]);
    if (!sub)
      return json(res, 404, { error: { type: "invalid_request_error", message: "No such subscription" } });
    if (req.method === "POST") {
      if (form.cancel_at_period_end !== undefined)
        sub.cancel_at_period_end = form.cancel_at_period_end === "true";
      const price = PRICES.find((x) => x.id === form["items[0][price]"]);
      if (price) sub.items.data[0].price = price;
    }
    return json(res, 200, sub);
  }
  if (req.method === "POST" && p === "/v1/setup_intents")
    return json(res, 200, {
      id: sid("seti"),
      object: "setup_intent",
      client_secret: `${sid("seti")}_secret_prueba`,
    });
  if (req.method === "GET" && p === "/v1/invoices")
    return json(res, 200, list(stripe.invoices.get(url.searchParams.get("customer")) ?? []));
  return json(res, 404, {
    error: { type: "invalid_request_error", message: `Sin imitar: ${req.method} ${p}` },
  });
}

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://captura");
  let raw = "";
  req.on("data", (c) => {
    raw += c;
  });
  req.on("end", () => {
    if (url.pathname === "/__requests") {
      if (req.method === "DELETE") {
        requests = [];
        return json(res, 204, {});
      }
      const prefix = url.searchParams.get("path") ?? "";
      return json(
        res,
        200,
        requests.filter((r) => r.path.startsWith(prefix)),
      );
    }
    if (url.pathname === "/__fail") {
      const { path, status } = JSON.parse(raw || "{}");
      failures.set(path, status);
      return json(res, 204, {});
    }
    if (url.pathname === "/healthz") return json(res, 200, { ok: true });
    if (url.pathname === "/__stripe/subscriptions" && req.method === "POST")
      return json(res, 200, subscription(JSON.parse(raw || "{}")));
    if (url.pathname === "/__stripe/customers") return json(res, 200, [...stripe.customers.values()]);
    if (url.pathname === "/__prov/busy" && req.method === "POST") {
      const { account: name, start, end } = JSON.parse(raw || "{}");
      account(name).busy.push({ start, end });
      return json(res, 200, { ok: true });
    }
    if (url.pathname === "/__prov/revoke" && req.method === "POST") {
      account(JSON.parse(raw || "{}").account).revoked = true;
      return json(res, 200, { ok: true });
    }
    if (url.pathname === "/__prov/events")
      return json(res, 200, [...account(url.searchParams.get("account") ?? "").events.values()]);
    if (url.pathname === "/__prov/move" && req.method === "POST") {
      const { account: name, start, end } = JSON.parse(raw || "{}");
      for (const ev of account(name).events.values()) {
        ev.start = ev.start?.timeZone
          ? { dateTime: start.replace("Z", ""), timeZone: "UTC" }
          : { dateTime: start };
        ev.end = ev.end?.timeZone ? { dateTime: end.replace("Z", ""), timeZone: "UTC" } : { dateTime: end };
      }
      return json(res, 200, { ok: true });
    }
    let body = raw;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = Object.fromEntries(new URLSearchParams(raw));
    }
    requests.push({
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: req.headers,
      body,
      at: new Date().toISOString(),
    });
    for (const [prefix, status] of failures) {
      if (url.pathname.startsWith(prefix)) {
        failures.delete(prefix);
        return json(res, status, { ok: false });
      }
    }
    const form = typeof body === "object" && body ? body : {};
    if (url.pathname.startsWith("/v1/")) return fakeStripe(req, url, form, res);
    if (url.pathname.startsWith("/google/")) return fakeGoogle(req, url, form, res);
    if (url.pathname.startsWith("/ms/") || url.pathname.startsWith("/graph/"))
      return fakeGraph(req, url, form, res);
    if (url.pathname === "/slack/authorize") {
      const back = new URL(url.searchParams.get("redirect_uri") ?? "http://localhost/");
      back.searchParams.set("code", "codigo-de-prueba");
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }
    if (url.pathname === "/slack/oauth.v2.access") {
      return json(res, 200, {
        ok: true,
        incoming_webhook: { url: "http://captura:4010/slack/hook/prueba", channel: "#avisos" },
      });
    }
    if (url.pathname.startsWith("/telegram/"))
      return json(res, 200, { ok: true, result: { message_id: requests.length } });
    if (url.pathname.startsWith("/whatsapp/"))
      return json(res, 200, { messages: [{ id: `wamid.${requests.length}` }] });
    if (url.pathname.startsWith("/slack/hook/")) {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("ok");
    }
    return json(res, 404, { ok: false });
  });
}).listen(PORT, () => console.log(`captura escuchando en ${PORT}`));
