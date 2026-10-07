// Servidor de captura (solo pruebas): imita lo mínimo de Telegram, Slack y WhatsApp y guarda lo recibido.
//   GET    /__requests?path=<prefijo>  → peticiones recibidas
//   DELETE /__requests                 → vaciar
//   POST   /__fail {"path": "...", "status": 403} → la siguiente petición a ese prefijo falla
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4010);
let requests = [];
const failures = new Map();

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
