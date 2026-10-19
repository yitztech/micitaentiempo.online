import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../auth/auth.service.js";
import type { AdminDatabase } from "../db/admin-db.js";
import type { PlatformDatabase } from "../db/platform-db.js";

interface LoginBody {
  username?: string;
  password?: string;
}

interface BlockUserBody {
  email?: string;
  reason?: string;
}

export function registerApiRoutes(
  app: FastifyInstance,
  auth: AuthService,
  adminDb: AdminDatabase,
  platformDb: PlatformDatabase,
) {
  // ── Autenticación ──
  app.post("/api/auth/login", async (req: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return reply.status(400).send({ error: "Usuario y contraseña requeridos" });
    }

    const result = auth.login(username, password);
    if (!result) {
      return reply.status(401).send({ error: "Credenciales incorrectas" });
    }

    reply.header(
      "Set-Cookie",
      `admin_token=${encodeURIComponent(result.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
    );
    return result;
  });

  app.post("/api/auth/logout", async (req: FastifyRequest, reply: FastifyReply) => {
    const admin = auth.authenticate(req);
    if (admin) {
      auth.logout(admin.token, admin.username);
    }
    reply.header("Set-Cookie", "admin_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    return { ok: true };
  });

  app.get("/api/auth/me", async (req: FastifyRequest, reply: FastifyReply) => {
    const admin = auth.authenticate(req);
    if (!admin) {
      return reply.status(401).send({ error: "No autenticado" });
    }
    return { user: { id: admin.id, username: admin.username } };
  });

  // ── Estadísticas del Sitio ──
  app.get("/api/stats", async (req: FastifyRequest, reply: FastifyReply) => {
    const admin = auth.requireAuth(req, reply);
    if (!admin) return;

    const blockedList = adminDb.getBlockedUsers();
    const stats = await platformDb.getStats(blockedList.length);
    return stats;
  });

  // ── Gestión de Usuarios ──
  app.get(
    "/api/users",
    async (
      req: FastifyRequest<{
        Querystring: { q?: string; filter?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const admin = auth.requireAuth(req, reply);
      if (!admin) return;

      const users = await platformDb.getUsers(req.query.q, req.query.filter);
      const blockedSet = new Set(adminDb.getBlockedUsers().map((b) => b.user_id));

      const enrichedUsers = users.map((u) => ({
        ...u,
        is_blocked: blockedSet.has(u.id),
      }));

      return { users: enrichedUsers };
    },
  );

  // ── Bloquear Usuario ──
  app.post(
    "/api/users/:id/block",
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: BlockUserBody;
      }>,
      reply: FastifyReply,
    ) => {
      const admin = auth.requireAuth(req, reply);
      if (!admin) return;

      const userId = req.params.id;
      const { email = "", reason = "Bloqueado por administración" } = req.body || {};

      // 1. Guarda en su propia base de datos SQLite (datos aislados de administración)
      const blocked = adminDb.blockUser(userId, email, reason, admin.username);

      // 2. Revoca sesiones activas y suspende organización en la plataforma
      await platformDb.revokeUserSessionsAndSuspendOrg(userId);

      return { ok: true, blocked };
    },
  );

  // ── Desbloquear Usuario ──
  app.post(
    "/api/users/:id/unblock",
    async (
      req: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const admin = auth.requireAuth(req, reply);
      if (!admin) return;

      const userId = req.params.id;
      const unblocked = adminDb.unblockUser(userId, admin.username);

      // Restaura la organización del usuario
      await platformDb.restoreUserOrg(userId);

      return { ok: true, unblocked };
    },
  );

  // ── Cancelaciones y Suscripciones ──
  app.get("/api/subscriptions", async (req: FastifyRequest, reply: FastifyReply) => {
    const admin = auth.requireAuth(req, reply);
    if (!admin) return;

    const subscriptions = await platformDb.getSubscriptions();
    const cancellations = subscriptions.filter(
      (s) => s.cancel_at_period_end || s.status === "past_due" || s.status === "suspended",
    );

    return {
      subscriptions,
      cancellations,
      summary: {
        totalSubscriptions: subscriptions.length,
        totalCanceled: cancellations.length,
        churnRatePercent:
          subscriptions.length > 0 ? Math.round((cancellations.length / subscriptions.length) * 100) : 0,
      },
    };
  });

  // ── Lista de Usuarios Bloqueados ──
  app.get("/api/blocked-users", async (req: FastifyRequest, reply: FastifyReply) => {
    const admin = auth.requireAuth(req, reply);
    if (!admin) return;

    const blocked = adminDb.getBlockedUsers();
    return { blocked };
  });

  // ── Registro de Auditoría ──
  app.get("/api/audit-logs", async (req: FastifyRequest, reply: FastifyReply) => {
    const admin = auth.requireAuth(req, reply);
    if (!admin) return;

    const logs = adminDb.getAuditLogs(150);
    return { logs };
  });
}
