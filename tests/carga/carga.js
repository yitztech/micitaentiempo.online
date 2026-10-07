// Prueba de carga (F12): topología de producción con sus límites de memoria, en el entorno de pruebas.
//   docker run --rm --add-host micitaentiempo.localhost:host-gateway --add-host mailpit:host-gateway \
//     -v "$PWD/tests/carga:/carga" grafana/k6:2.3.0 run /carga/carga.js
// Requiere TEST_MODE (sin ALTCHA) y los límites del gateway subidos (una sola IP genera toda la carga).
import { check, sleep } from "k6";
import http from "k6/http";

const BASE = __ENV.BASE ?? "http://micitaentiempo.localhost:8080";
const MAIL = __ENV.MAIL ?? "http://mailpit:8025";
const CLAVE = "una-clave-bien-larga-2026";

export const options = {
  stages: [
    { duration: "30s", target: 30 },
    { duration: "2m", target: 30 },
    { duration: "30s", target: 60 },
    { duration: "1m", target: 60 },
    { duration: "20s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{tipo:pagina}": ["p(95)<800"],
    "http_req_duration{tipo:api}": ["p(95)<500"],
  },
};

const json = (body, extra = {}) => ({
  headers: { "content-type": "application/json", origin: BASE, ...extra },
  ...(body === undefined ? {} : {}),
});

function post(path, body, params = {}) {
  const res = http.post(`${BASE}${path}`, JSON.stringify(body), json(body, params.headers ?? {}));
  if (res.status >= 300) throw new Error(`${path} → ${res.status} ${res.body}`);
  return res;
}

/** Negocio de prueba: propietario verificado, tablero con horario y un servicio. */
export function setup() {
  const email = `carga-${Date.now()}@escenarios.test`;
  post("/api/auth/sign-up/email", { name: "Carga", email, password: CLAVE });
  let link;
  for (let i = 0; i < 30 && !link; i++) {
    sleep(0.5);
    const list = http.get(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).json();
    if (list.messages?.length) {
      const msg = http.get(`${MAIL}/api/v1/message/${list.messages[0].ID}`).json();
      link = msg.Text.match(/https?:\/\/\S*verify-email\S*/)?.[0];
    }
  }
  if (!link) throw new Error("sin correo de verificación");
  http.get(link.replace(/^https?:\/\/[^/]+/, BASE), { redirects: 0 });
  post("/api/auth/sign-in/email", { email, password: CLAVE });
  const jar = http.cookieJar();
  const cookies = jar.cookiesForURL(BASE);
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v[0]}`)
    .join("; ");
  post("/api/v1/org", { name: "Negocio de carga", plan: "personal" });
  const cal = post("/api/v1/calendars", {
    name: "Carga",
    timezone: "America/Mexico_City",
    country: "MX",
  }).json();
  const shifts = [1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    kind: "open",
    range: { start: "08:00", end: "20:00" },
  }));
  const put = http.put(`${BASE}/api/v1/calendars/${cal.id}/hours`, JSON.stringify({ shifts }), json());
  if (put.status !== 200) throw new Error(`horario → ${put.status}`);
  const svc = post(`/api/v1/calendars/${cal.id}/services`, {
    name: { es: "Consulta" },
    durationMin: 30,
    slotStepMin: 30,
  }).json();
  return { cookie, calId: cal.id, slug: cal.slug, serviceId: svc.id };
}

export default function (d) {
  const now = new Date();
  const from = now.toISOString();
  const to = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const r = Math.random();
  let res;
  if (r < 0.4) {
    res = http.get(
      `${BASE}/api/public/v1/calendars/${d.slug}/availability?service=${d.serviceId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { tags: { tipo: "api", nombre: "disponibilidad" } },
    );
  } else if (r < 0.6) {
    res = http.get(`${BASE}/`, { tags: { tipo: "pagina", nombre: "inicio" } });
  } else if (r < 0.8) {
    res = http.get(`${BASE}/reservar/${d.slug}`, { tags: { tipo: "pagina", nombre: "reserva" } });
  } else {
    res = http.get(
      `${BASE}/api/v1/calendars/${d.calId}/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { headers: { cookie: d.cookie }, tags: { tipo: "api", nombre: "panel-eventos" } },
    );
  }
  check(res, { 200: (x) => x.status === 200 });
  sleep(0.5 + Math.random());
}
