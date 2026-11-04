import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../auth/auth.service.js";
import type { AdminDatabase } from "../db/admin-db.js";
import {
  ECONOMIC_STATUSES,
  type PlatformDatabase,
  PlatformDatabaseUnavailableError,
  PlatformRestrictionNotFoundError,
  PlatformUserNotFoundError,
  RestrictionReconciliationRequiredError,
} from "../db/platform-db.js";

interface LoginBody {
  username?: string;
  password?: string;
}

interface BlockUserBody {
  email?: string;
  reason?: string;
}

interface ReconcileUserBody {
  economicStatus?: unknown;
  reason?: unknown;
}

function sendPlatformError(error: unknown, reply: FastifyReply): FastifyReply {
  if (error instanceof PlatformUserNotFoundError) return reply.status(404).send({ code: "user_not_found" });
  if (error instanceof PlatformRestrictionNotFoundError)
    return reply.status(404).send({ code: "restriction_not_found" });
  if (error instanceof RestrictionReconciliationRequiredError)
    return reply.status(409).send({ code: "restriction_reconciliation_required" });
  if (error instanceof PlatformDatabaseUnavailableError)
    return reply.status(503).send({ code: "platform_unavailable" });
  throw error;
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
    if (
      !username ||
      !password ||
      typeof username !== "string" ||
      typeof password !== "string" ||
      username.length > 100 ||
      password.length > 128
    ) {
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

    try {
      return await platformDb.getStats();
    } catch (error) {
      return sendPlatformError(error, reply);
    }
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

      try {
        const users = await platformDb.getUsers(req.query.q, req.query.filter);
        return { users };
      } catch (error) {
        return sendPlatformError(error, reply);
      }
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
      const reasonInput = req.body?.reason ?? "Bloqueado por administración";
      if (
        typeof reasonInput !== "string" ||
        !reasonInput.trim() ||
        Array.from(reasonInput.trim()).length > 2000
      ) {
        return reply.status(422).send({ code: "invalid_restriction_reason" });
      }
      const reason = reasonInput.trim();

      try {
        const restriction = await platformDb.setUserRestriction(userId, reason, admin.username);
        // Also repairs a missing SQLite mirror if PostgreSQL committed before a prior mirror failure.
        adminDb.blockUser(userId, restriction.email, restriction.reason, admin.username);
        const body = {
          ok: true,
          blocked: {
            user_id: restriction.userId,
            email: restriction.email,
            reason: restriction.reason,
            blocked_at: restriction.blockedAt,
            blocked_by: restriction.blockedBy,
          },
          calendarStatusPending: restriction.calendarStatusPending,
        };
        if (restriction.calendarStatusPending) {
          return reply.status(202).send({ ...body, code: "restriction_sync_pending" });
        }
        return body;
      } catch (error) {
        return sendPlatformError(error, reply);
      }
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
      try {
        const restriction = await platformDb.removeUserRestriction(userId, admin.username);
        // Idempotent locally, including retries after a PostgreSQL commit.
        adminDb.unblockUser(userId, admin.username);
        const body = {
          ok: true,
          unblocked: restriction.changed,
          calendarStatusPending: restriction.calendarStatusPending,
        };
        if (restriction.calendarStatusPending) {
          return reply.status(202).send({ ...body, code: "restriction_sync_pending" });
        }
        return body;
      } catch (error) {
        return sendPlatformError(error, reply);
      }
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
  // ── Reconciliar una suspensión histórica ──
  app.post(
    "/api/users/:id/reconcile",
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: ReconcileUserBody;
      }>,
      reply: FastifyReply,
    ) => {
      const admin = auth.requireAuth(req, reply);
      if (!admin) return;

      const economicStatus = ECONOMIC_STATUSES.find((status) => status === req.body?.economicStatus);
      if (!economicStatus) return reply.status(422).send({ code: "invalid_economic_status" });
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      if (!reason || Array.from(reason).length > 2000) {
        return reply.status(422).send({ code: "invalid_reconciliation_reason" });
      }

      try {
        const result = await platformDb.reconcileRestriction(
          req.params.id,
          economicStatus,
          reason,
          admin.username,
        );
        if (result.changed) {
          adminDb.addAuditLog(
            "USER_RESTRICTION_RECONCILED",
            "user",
            result.userId,
            `Suspensión histórica de ${result.email} conciliada como ${economicStatus}. Motivo: ${reason}`,
            admin.username,
          );
        }
        const body = {
          ok: true,
          reconciled: result.changed,
          calendarStatusPending: result.calendarStatusPending,
        };
        if (result.calendarStatusPending) {
          return reply.status(202).send({ ...body, code: "restriction_sync_pending" });
        }
        return body;
      } catch (error) {
        return sendPlatformError(error, reply);
      }
    },
  );

  app.get("/api/blocked-users", async (req: FastifyRequest, reply: FastifyReply) => {
    const admin = auth.requireAuth(req, reply);
    if (!admin) return;

    try {
      const blocked = await platformDb.getBlockedUsers();
      return { blocked };
    } catch (error) {
      return sendPlatformError(error, reply);
    }
  });

  // ── Registro de Auditoría ──
  app.get("/api/audit-logs", async (req: FastifyRequest, reply: FastifyReply) => {
    const admin = auth.requireAuth(req, reply);
    if (!admin) return;

    const logs = adminDb.getAuditLogs(150);
    return { logs };
  });
}
