import { randomUUID } from "node:crypto";
import { Pool as PgPool, type Pool, type PoolClient } from "pg";
import type { AdminConfig } from "../config.js";

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  locale: string | null;
  country: string | null;
  created_at: string;
  org_id: string | null;
  org_name: string | null;
  org_plan: string | null;
  org_status: string | null;
  org_cancel_at_period_end: boolean | null;
  org_current_period_end: string | null;
  is_blocked?: boolean;
}

export interface PlatformBlockedUser {
  user_id: string;
  email: string;
  reason: string;
  blocked_at: string;
  blocked_by: string;
  reconciliation_required: boolean;
}

export interface RestrictionChange {
  userId: string;
  email: string;
  reason: string;
  blockedAt: string;
  blockedBy: string;
  reconciliationRequired: boolean;
  changed: boolean;
  calendarStatusPending: boolean;
}

/** Estados económicos que puede declarar una reconciliación: `suspended` ya no es uno de ellos. */
export const ECONOMIC_STATUSES = ["trialing", "active", "past_due", "read_only"] as const;
export type EconomicStatus = (typeof ECONOMIC_STATUSES)[number];

export interface RestrictionReconciliation {
  userId: string;
  email: string;
  changed: boolean;
  organizationIds: string[];
  calendarStatusPending: boolean;
}

export class PlatformDatabaseUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("No se pudo completar la operación en PostgreSQL", options);
    this.name = "PlatformDatabaseUnavailableError";
  }
}

export class PlatformUserNotFoundError extends Error {
  constructor() {
    super("Usuario de plataforma no encontrado");
    this.name = "PlatformUserNotFoundError";
  }
}

export class PlatformRestrictionNotFoundError extends Error {
  constructor() {
    super("El usuario no tiene ninguna restricción activa");
    this.name = "PlatformRestrictionNotFoundError";
  }
}

export class RestrictionReconciliationRequiredError extends Error {
  constructor() {
    super("La suspensión histórica requiere reconciliación antes de desbloquear");
    this.name = "RestrictionReconciliationRequiredError";
  }
}

export interface LegacyBlockedUser {
  user_id: string;
  email: string;
  reason: string;
  blocked_at: string;
  blocked_by: string;
}

interface RestrictionRow {
  user_id: string;
  reason: string;
  blocked_at: string | Date;
  blocked_by: string;
  reconciliation_required: boolean;
}

export interface PlatformSubscription {
  id: string;
  org_name: string;
  plan: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  trial_ends_at: string | null;
  past_due_since: string | null;
  created_at: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
}

export interface PlatformStats {
  totalUsers: number;
  verifiedUsers: number;
  newUsers7d: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  pastDueSubscriptions: number;
  canceledSubscriptions: number;
  personalPlans: number;
  branchesPlans: number;
  totalAppointments: number;
  blockedUsers: number;
  mrrEstimate: number;
}

// Datos de demostración cuando PostgreSQL no está configurado (entorno de pruebas local/unitario)
const MOCK_USERS: PlatformUser[] = [
  {
    id: "usr-demo-1",
    name: "Dr. Carlos Mendoza",
    email: "carlos.mendoza@example.com",
    email_verified: true,
    locale: "es",
    country: "MX",
    created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    org_id: "org-1",
    org_name: "Consultorio Dr. Mendoza",
    org_plan: "personal",
    org_status: "active",
    org_cancel_at_period_end: false,
    org_current_period_end: new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: "usr-demo-2",
    name: "Dra. Elena Ramos",
    email: "elena.ramos@example.com",
    email_verified: true,
    locale: "es",
    country: "ES",
    created_at: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
    org_id: "org-2",
    org_name: "Clínica Dental Ramos",
    org_plan: "branches",
    org_status: "active",
    org_cancel_at_period_end: false,
    org_current_period_end: new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: "usr-demo-3",
    name: "John Miller",
    email: "john.miller@example.com",
    email_verified: true,
    locale: "en",
    country: "US",
    created_at: new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString(),
    org_id: "org-3",
    org_name: "Miller Consulting",
    org_plan: "personal",
    org_status: "active",
    org_cancel_at_period_end: true,
    org_current_period_end: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: "usr-demo-4",
    name: "Sophie Dubois",
    email: "sophie.dubois@example.com",
    email_verified: false,
    locale: "fr",
    country: "FR",
    created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    org_id: "org-4",
    org_name: "Institut Beauté Dubois",
    org_plan: "personal",
    org_status: "trialing",
    org_cancel_at_period_end: false,
    org_current_period_end: null,
  },
];

export class PlatformDatabase {
  private pool: Pool | null = null;
  private isConnected = false;

  constructor(config: AdminConfig, poolOverride?: Pool) {
    if (poolOverride) {
      this.pool = poolOverride;
    } else if (config.pg.host) {
      try {
        this.pool = new PgPool({
          host: config.pg.host,
          port: config.pg.port,
          database: config.pg.database,
          user: config.pg.user,
          password: config.pg.password,
          connectionTimeoutMillis: 3000,
          max: 5,
        });
        // Intenta verificar la conexión silenciosamente
        void this.pool.query("SELECT 1").then(
          () => {
            this.isConnected = true;
          },
          () => {
            this.isConnected = false;
          },
        );
      } catch {
        this.pool = null;
        this.isConnected = false;
      }
    }
  }

  async getStats(blockedCount = 0): Promise<PlatformStats> {
    if (this.pool) {
      try {
        const usersRes = await this.pool.query(`
          SELECT
            COUNT(*)::int as total_users,
            COUNT(*) FILTER (WHERE email_verified = true)::int as verified_users,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int as new_users_7d
          FROM app.users
        `);

        const orgsRes = await this.pool.query(`
          SELECT
            status,
            plan,
            cancel_at_period_end,
            COUNT(*)::int as count
          FROM app.organizations
          WHERE deleted_at IS NULL
          GROUP BY status, plan, cancel_at_period_end
        `);
        const blockedRes = await this.pool.query("SELECT count(*)::int AS count FROM app.user_restrictions");

        let totalEvents = 0;
        try {
          const eventsRes = await this.pool.query("SELECT COUNT(*)::int as count FROM calendar.events");
          totalEvents = eventsRes.rows[0]?.count ?? 0;
        } catch {
          totalEvents = 0;
        }

        const uRow = usersRes.rows[0] ?? {
          total_users: 0,
          verified_users: 0,
          new_users_7d: 0,
        };

        let activeSubs = 0;
        let trialSubs = 0;
        let pastDueSubs = 0;
        let canceledSubs = 0;
        let personalPlans = 0;
        let branchesPlans = 0;
        let mrr = 0;

        for (const row of orgsRes.rows) {
          const count = Number(row.count) || 0;
          if (row.plan === "personal") personalPlans += count;
          if (row.plan === "branches") branchesPlans += count;

          if (row.status === "active") {
            activeSubs += count;
            mrr += row.plan === "branches" ? count * 20 : count * 5;
          }
          if (row.status === "trialing") trialSubs += count;
          if (row.status === "past_due") pastDueSubs += count;
          if (row.cancel_at_period_end || row.status === "suspended") {
            canceledSubs += count;
          }
        }

        return {
          totalUsers: Number(uRow.total_users) || 0,
          verifiedUsers: Number(uRow.verified_users) || 0,
          newUsers7d: Number(uRow.new_users_7d) || 0,
          activeSubscriptions: activeSubs,
          trialSubscriptions: trialSubs,
          pastDueSubscriptions: pastDueSubs,
          canceledSubscriptions: canceledSubs,
          personalPlans,
          branchesPlans,
          totalAppointments: totalEvents,
          blockedUsers: Number(blockedRes.rows[0]?.count) || 0,
          mrrEstimate: mrr,
        };
      } catch (error) {
        throw new PlatformDatabaseUnavailableError({ cause: error });
      }
    }

    // Datos simulados de respaldo
    return {
      totalUsers: 1420 + MOCK_USERS.length,
      verifiedUsers: 1280,
      newUsers7d: 48,
      activeSubscriptions: 312,
      trialSubscriptions: 85,
      pastDueSubscriptions: 14,
      canceledSubscriptions: 29,
      personalPlans: 240,
      branchesPlans: 72,
      totalAppointments: 18450,
      blockedUsers: blockedCount,
      mrrEstimate: 240 * 5 + 72 * 20, // US$ 2,640 / mes
    };
  }

  async getUsers(search?: string, filter?: string): Promise<PlatformUser[]> {
    if (this.pool) {
      try {
        let query = `
          SELECT
            u.id,
            u.name,
            u.email,
            u.email_verified,
            u.locale,
            u.country,
            u.created_at,
            o.id as org_id,
            o.name as org_name,
            o.plan as org_plan,
            o.status as org_status,
            o.cancel_at_period_end as org_cancel_at_period_end,
            o.current_period_end as org_current_period_end,
            (r.user_id IS NOT NULL) AS is_blocked
          FROM app.users u
          LEFT JOIN app.organizations o ON o.owner_user_id = u.id AND o.deleted_at IS NULL
          LEFT JOIN app.user_restrictions r ON r.user_id = u.id
          WHERE 1=1
        `;
        const params: unknown[] = [];

        if (search) {
          params.push(`%${search.trim().toLowerCase()}%`);
          query += ` AND (LOWER(u.name) LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length})`;
        }

        if (filter === "verified") {
          query += " AND u.email_verified = true";
        } else if (filter === "unverified") {
          query += " AND u.email_verified = false";
        }

        query += " ORDER BY u.created_at DESC LIMIT 200";

        const res = await this.pool.query(query, params);
        return res.rows.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          email_verified: Boolean(r.email_verified),
          locale: r.locale,
          country: r.country,
          created_at: r.created_at ? new Date(r.created_at).toISOString() : "",
          org_id: r.org_id,
          org_name: r.org_name,
          org_plan: r.org_plan,
          org_status: r.org_status,
          org_cancel_at_period_end: Boolean(r.org_cancel_at_period_end),
          org_current_period_end: r.org_current_period_end
            ? new Date(r.org_current_period_end).toISOString()
            : null,
          is_blocked: Boolean(r.is_blocked),
        }));
      } catch (error) {
        throw new PlatformDatabaseUnavailableError({ cause: error });
      }
    }

    let list = [...MOCK_USERS];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    if (filter === "verified") list = list.filter((u) => u.email_verified);
    if (filter === "unverified") list = list.filter((u) => !u.email_verified);
    return list;
  }

  async getSubscriptions(): Promise<PlatformSubscription[]> {
    if (this.pool && this.isConnected) {
      try {
        const query = `
          SELECT
            o.id,
            o.name as org_name,
            o.plan,
            o.status,
            o.cancel_at_period_end,
            o.current_period_end,
            o.trial_ends_at,
            o.past_due_since,
            o.created_at,
            u.id as owner_id,
            u.name as owner_name,
            u.email as owner_email
          FROM app.organizations o
          JOIN app.users u ON u.id = o.owner_user_id
          WHERE o.deleted_at IS NULL
          ORDER BY o.created_at DESC
          LIMIT 200
        `;
        const res = await this.pool.query(query);
        return res.rows.map((r) => ({
          id: r.id,
          org_name: r.org_name,
          plan: r.plan,
          status: r.status,
          cancel_at_period_end: Boolean(r.cancel_at_period_end),
          current_period_end: r.current_period_end ? new Date(r.current_period_end).toISOString() : null,
          trial_ends_at: r.trial_ends_at ? new Date(r.trial_ends_at).toISOString() : null,
          past_due_since: r.past_due_since ? new Date(r.past_due_since).toISOString() : null,
          created_at: new Date(r.created_at).toISOString(),
          owner_id: r.owner_id,
          owner_name: r.owner_name,
          owner_email: r.owner_email,
        }));
      } catch {
        // Fallback
      }
    }

    return MOCK_USERS.filter((u) => u.org_id).map((u) => ({
      id: u.org_id ?? "",
      org_name: u.org_name ?? "",
      plan: u.org_plan ?? "free",
      status: u.org_status ?? "active",
      cancel_at_period_end: Boolean(u.org_cancel_at_period_end),
      current_period_end: u.org_current_period_end,
      trial_ends_at: null,
      past_due_since: null,
      created_at: u.created_at,
      owner_id: u.id,
      owner_name: u.name,
      owner_email: u.email,
    }));
  }

  async getBlockedUsers(): Promise<PlatformBlockedUser[]> {
    if (!this.pool) return [];
    try {
      const result = await this.pool.query<PlatformBlockedUser>(`
        SELECT
          r.user_id,
          u.email,
          r.reason,
          r.blocked_at,
          r.blocked_by,
          r.reconciliation_required
        FROM app.user_restrictions r
        JOIN app.users u ON u.id = r.user_id
        ORDER BY r.blocked_at DESC
      `);
      return result.rows.map((row) => ({
        ...row,
        blocked_at: row.blocked_at ? new Date(row.blocked_at).toISOString() : "",
        reconciliation_required: Boolean(row.reconciliation_required),
      }));
    } catch (error) {
      throw new PlatformDatabaseUnavailableError({ cause: error });
    }
  }

  async setUserRestriction(userId: string, reason: string, adminUser: string): Promise<RestrictionChange> {
    const normalizedReason = reason.trim();
    const normalizedAdmin = adminUser.trim();
    if (!normalizedReason || Array.from(normalizedReason).length > 2000)
      throw new Error("Motivo de bloqueo no válido");
    if (!normalizedAdmin || Array.from(normalizedAdmin).length > 100)
      throw new Error("Actor administrativo no válido");

    return this.transaction(async (client) => {
      const user = await client.query<{ id: string; email: string }>(
        "SELECT id, email FROM app.users WHERE id = $1 FOR UPDATE",
        [userId],
      );
      const target = user.rows[0];
      if (!target) throw new PlatformUserNotFoundError();

      const prior = await client.query<RestrictionRow>(
        `SELECT user_id, reason, blocked_at, blocked_by, reconciliation_required
         FROM app.user_restrictions WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      let restriction = prior.rows[0];
      let changed = false;
      if (!restriction) {
        const inserted = await client.query<RestrictionRow>(
          `INSERT INTO app.user_restrictions (user_id, reason, blocked_by, reconciliation_required)
           VALUES ($1, $2, $3, false)
           ON CONFLICT (user_id) DO NOTHING
           RETURNING user_id, reason, blocked_at, blocked_by, reconciliation_required`,
          [userId, normalizedReason, normalizedAdmin],
        );
        restriction = inserted.rows[0];
        changed = Boolean(restriction);
        if (!restriction) {
          const concurrent = await client.query<RestrictionRow>(
            `SELECT user_id, reason, blocked_at, blocked_by, reconciliation_required
             FROM app.user_restrictions WHERE user_id = $1 FOR UPDATE`,
            [userId],
          );
          restriction = concurrent.rows[0];
        }
      }
      if (!restriction) throw new Error("No se pudo persistir la restricción");

      await this.revokeSessions(client, userId);
      const organizations = changed
        ? await this.markOwnerOrganizationsPending(client, userId)
        : await this.ownerOrganizations(client, userId);
      if (changed) {
        await this.writeRestrictionAudit(client, "user.restriction.created", userId, normalizedAdmin, {
          reason: normalizedReason,
        });
      }
      return {
        ...this.mapRestriction(restriction),
        email: target.email,
        changed,
        calendarStatusPending: organizations.some((org) => org.calendar_status_pending),
      };
    });
  }

  async removeUserRestriction(userId: string, adminUser: string): Promise<RestrictionChange> {
    return this.transaction(async (client) => {
      const user = await client.query<{ id: string; email: string }>(
        "SELECT id, email FROM app.users WHERE id = $1 FOR UPDATE",
        [userId],
      );
      const target = user.rows[0];
      if (!target) throw new PlatformUserNotFoundError();

      const prior = await client.query<RestrictionRow>(
        `SELECT user_id, reason, blocked_at, blocked_by, reconciliation_required
         FROM app.user_restrictions WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      const restriction = prior.rows[0];
      if (restriction?.reconciliation_required) throw new RestrictionReconciliationRequiredError();

      let changed = false;
      if (restriction) {
        const deleted = await client.query<RestrictionRow>(
          `DELETE FROM app.user_restrictions WHERE user_id = $1
           RETURNING user_id, reason, blocked_at, blocked_by, reconciliation_required`,
          [userId],
        );
        changed = Boolean(deleted.rows[0]);
        if (changed) {
          await this.markOwnerOrganizationsPending(client, userId);
          await this.writeRestrictionAudit(client, "user.restriction.removed", userId, adminUser, {
            reason: restriction.reason,
          });
        }
      }

      const organizations = await this.ownerOrganizations(client, userId);
      return {
        userId,
        email: target.email,
        reason: restriction?.reason ?? "",
        blockedAt: restriction?.blocked_at ? new Date(restriction.blocked_at).toISOString() : "",
        blockedBy: restriction?.blocked_by ?? adminUser,
        reconciliationRequired: false,
        changed,
        calendarStatusPending: organizations.some((org) => org.calendar_status_pending),
      };
    });
  }

  /**
   * Cierra una suspensión histórica: `suspended` en `organizations.status` no conserva el estado económico anterior,
   * así que lo declara quien revisó la causa. La cuenta sigue bloqueada; desbloquearla es un paso aparte. Repetir la
   * acción no cambia nada, y una organización cerrada se queda como está.
   */
  async reconcileRestriction(
    userId: string,
    economicStatus: EconomicStatus,
    reason: string,
    adminUser: string,
  ): Promise<RestrictionReconciliation> {
    return this.transaction(async (client) => {
      const user = await client.query<{ id: string; email: string }>(
        "SELECT id, email FROM app.users WHERE id = $1 FOR UPDATE",
        [userId],
      );
      const target = user.rows[0];
      if (!target) throw new PlatformUserNotFoundError();

      const prior = await client.query<RestrictionRow>(
        `SELECT user_id, reason, blocked_at, blocked_by, reconciliation_required
         FROM app.user_restrictions WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      const restriction = prior.rows[0];
      if (!restriction) throw new PlatformRestrictionNotFoundError();

      let organizationIds: string[] = [];
      if (restriction.reconciliation_required) {
        const updated = await client.query<{ id: string }>(
          `UPDATE app.organizations
           SET status = $2,
               past_due_since = CASE WHEN $2 = 'past_due' THEN COALESCE(past_due_since, now()) ELSE NULL END,
               calendar_status_pending = true
           WHERE owner_user_id = $1 AND deleted_at IS NULL AND status = 'suspended'
           RETURNING id`,
          [userId, economicStatus],
        );
        organizationIds = updated.rows.map((row) => row.id);
        await client.query(
          "UPDATE app.user_restrictions SET reconciliation_required = false WHERE user_id = $1",
          [userId],
        );
        await this.writeRestrictionAudit(client, "user.restriction.reconciled", userId, adminUser, {
          economicStatus,
          reason,
          organizationIds,
        });
      }

      const organizations = await this.ownerOrganizations(client, userId);
      return {
        userId,
        email: target.email,
        changed: restriction.reconciliation_required,
        organizationIds,
        calendarStatusPending: organizations.some((org) => org.calendar_status_pending),
      };
    });
  }

  /** Importación idempotente de los bloqueos previos guardados en SQLite. */
  async importLegacyRestrictions(
    legacyRows: readonly LegacyBlockedUser[],
  ): Promise<{ imported: number; orphaned: number }> {
    if (legacyRows.length === 0) return { imported: 0, orphaned: 0 };
    return this.transaction(async (client) => {
      let imported = 0;
      let orphaned = 0;
      for (const row of legacyRows) {
        const user = await client.query<{ id: string; email: string }>(
          "SELECT id, email FROM app.users WHERE id = $1 FOR UPDATE",
          [row.user_id],
        );
        if (!user.rows[0]) {
          await client.query(
            `INSERT INTO app.audit_log (id, via, action, target, metadata)
             VALUES ($1, 'system', 'user.restriction.legacy_orphan', $2, $3::jsonb)
             ON CONFLICT (id) DO NOTHING`,
            [
              `legacy-restriction-orphan:${row.user_id}`,
              row.user_id,
              JSON.stringify({ source: "admin_sqlite" }),
            ],
          );
          orphaned++;
          continue;
        }

        const existing = await client.query<RestrictionRow>(
          `SELECT user_id, reason, blocked_at, blocked_by, reconciliation_required
           FROM app.user_restrictions WHERE user_id = $1 FOR UPDATE`,
          [row.user_id],
        );
        if (existing.rows[0] && existing.rows[0].blocked_by !== "system:legacy-reconciliation") continue;

        const legacyReason =
          Array.from(row.reason || "Bloqueado por administración").length <= 2000
            ? row.reason || "Bloqueado por administración"
            : "Restricción histórica con motivo demasiado largo; requiere revisión";
        const reasonNeedsReview = legacyReason !== (row.reason || "Bloqueado por administración");
        const actor = row.blocked_by.trim().slice(0, 100) || "system:legacy-reconciliation";
        const blockedAt = Number.isNaN(new Date(row.blocked_at).getTime())
          ? new Date()
          : new Date(row.blocked_at);
        const inserted = await client.query<RestrictionRow>(
          `INSERT INTO app.user_restrictions (user_id, reason, blocked_at, blocked_by, reconciliation_required)
           VALUES (
             $1, $2, $3, $4,
             $5 OR EXISTS (
               SELECT 1 FROM app.organizations
               WHERE owner_user_id = $1 AND status = 'suspended' AND deleted_at IS NULL
             )
           )
           ON CONFLICT (user_id) DO UPDATE SET
             reason = EXCLUDED.reason,
             blocked_at = EXCLUDED.blocked_at,
             blocked_by = EXCLUDED.blocked_by,
             reconciliation_required = user_restrictions.reconciliation_required OR EXCLUDED.reconciliation_required
           RETURNING user_id, reason, blocked_at, blocked_by, reconciliation_required`,
          [row.user_id, legacyReason, blockedAt, actor, reasonNeedsReview],
        );
        if (!inserted.rows[0]) continue;

        await this.revokeSessions(client, row.user_id);
        await this.markOwnerOrganizationsPending(client, row.user_id);
        await this.writeRestrictionAudit(client, "user.restriction.legacy_imported", row.user_id, actor, {
          reason: legacyReason,
          sourceBlockedAt: blockedAt.toISOString(),
          reconciliationRequired: Boolean(inserted.rows[0].reconciliation_required),
        });
        imported++;
      }
      return { imported, orphaned };
    });
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const pool = this.requirePool();
    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => undefined);
      if (
        error instanceof PlatformUserNotFoundError ||
        error instanceof PlatformRestrictionNotFoundError ||
        error instanceof RestrictionReconciliationRequiredError ||
        error instanceof PlatformDatabaseUnavailableError
      ) {
        throw error;
      }
      throw new PlatformDatabaseUnavailableError({ cause: error });
    } finally {
      client?.release();
    }
  }

  private requirePool(): Pool {
    if (!this.pool) throw new PlatformDatabaseUnavailableError();
    return this.pool;
  }

  private async revokeSessions(client: PoolClient, userId: string): Promise<void> {
    await client.query("DELETE FROM app.oauth_access_tokens WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM app.oauth_refresh_tokens WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM app.sessions WHERE user_id = $1", [userId]);
  }

  private async markOwnerOrganizationsPending(client: PoolClient, userId: string) {
    const result = await client.query<{ id: string; calendar_status_pending: boolean }>(
      `UPDATE app.organizations
       SET calendar_status_pending = true
       WHERE owner_user_id = $1 AND deleted_at IS NULL
       RETURNING id, calendar_status_pending`,
      [userId],
    );
    return result.rows;
  }

  private async ownerOrganizations(client: PoolClient, userId: string) {
    const result = await client.query<{ id: string; calendar_status_pending: boolean }>(
      `SELECT id, calendar_status_pending FROM app.organizations
       WHERE owner_user_id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    return result.rows;
  }

  private async writeRestrictionAudit(
    client: PoolClient,
    action: string,
    userId: string,
    adminUser: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO app.audit_log (id, org_id, actor_user_id, via, action, target, metadata)
       VALUES ($1, NULL, NULL, 'panel', $2, $3, $4::jsonb)`,
      [randomUUID(), action, userId, JSON.stringify({ adminUser, ...metadata })],
    );
  }

  private mapRestriction(row: RestrictionRow) {
    return {
      userId: row.user_id,
      reason: row.reason,
      blockedAt: new Date(row.blocked_at).toISOString(),
      blockedBy: row.blocked_by,
      reconciliationRequired: Boolean(row.reconciliation_required),
    };
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

export function createPlatformDatabase(config: AdminConfig): PlatformDatabase {
  return new PlatformDatabase(config);
}
