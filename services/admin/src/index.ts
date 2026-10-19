import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { type FastifyInstance, fastify } from "fastify";
import { AuthService } from "./auth/auth.service.js";
import { type AdminConfig, loadConfig } from "./config.js";
import { type AdminDatabase, createAdminDatabase } from "./db/admin-db.js";
import { createPlatformDatabase, type PlatformDatabase } from "./db/platform-db.js";
import { registerApiRoutes } from "./routes/api.routes.js";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export async function buildAdminApp(
  configOverride?: Partial<AdminConfig>,
  adminDbOverride?: AdminDatabase,
  platformDbOverride?: PlatformDatabase,
): Promise<{
  app: FastifyInstance;
  adminDb: AdminDatabase;
  platformDb: PlatformDatabase;
}> {
  const config = { ...loadConfig(), ...configOverride };
  const adminDb = adminDbOverride ?? createAdminDatabase(config);
  const platformDb = platformDbOverride ?? createPlatformDatabase(config);
  const auth = new AuthService(adminDb, config);

  const app = fastify({ logger: false });

  // Rutas de salud y versión requeridas por la plataforma
  app.get("/healthz", async () => "ok");
  app.get("/version.json", async () => ({ revision: config.releaseSha }));

  // Registrar rutas de la API del panel
  registerApiRoutes(app, auth, adminDb, platformDb);

  // Servidor de estáticos para el frontend en AngularJS 1.8.3
  const publicDir = resolve(process.cwd(), "public");
  const fallbackIndex = resolve(publicDir, "index.html");

  app.get("/*", async (req, reply) => {
    // Si la ruta inicia con /api/ y no coincidió con ninguna anterior, retorna 404 JSON
    if (req.url.startsWith("/api/")) {
      return reply.status(404).send({ error: "Endpoint no encontrado" });
    }

    const rawPath = req.url.split("?")[0] ?? "";
    const cleanPath = rawPath.replace(/^\//, "");
    const targetFile = cleanPath ? join(publicDir, cleanPath) : fallbackIndex;

    if (existsSync(targetFile) && !targetFile.endsWith("/")) {
      const ext = extname(targetFile);
      const mime = MIME_TYPES[ext] || "application/octet-stream";
      const content = readFileSync(targetFile);
      return reply
        .type(mime)
        .header(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';",
        )
        .send(content);
    }

    // Fallback SPA al index.html
    if (existsSync(fallbackIndex)) {
      const content = readFileSync(fallbackIndex);
      return reply
        .type("text/html; charset=utf-8")
        .header(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';",
        )
        .send(content);
    }

    return reply.status(404).send("Not Found");
  });

  return { app, adminDb, platformDb };
}

async function main() {
  const config = loadConfig();
  const { app } = await buildAdminApp(config);

  await app.listen({ port: config.port, host: config.host });
  console.log(`[admin] Panel de administración iniciado en http://${config.host}:${config.port}`);
}

if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  main().catch((err) => {
    console.error("[admin] Error fatal al iniciar:", err);
    process.exit(1);
  });
}
