import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import {
  PlatformDatabase,
  PlatformDatabaseUnavailableError,
  PlatformUserNotFoundError,
} from "../src/db/platform-db.js";

const config = {
  port: 3000,
  host: "localhost",
  dataDir: "/tmp",
  publicDir: "public",
  sqliteFile: ":memory:",
  initialAdminUser: "admin",
  initialAdminPassword: "test-password",
  releaseSha: "test",
  pg: { host: "postgres", port: 5432, database: "test", user: "test", password: "test" },
};

class RestrictionPool {
  restriction: Record<string, unknown> | null = null;
  userExists = true;
  failInsert = false;
  orgStatus = "read_only";
  pending = false;
  auditRows: string[] = [];
  statements: string[] = [];

  async connect() {
    return {
      query: async (sql: string, params: unknown[] = []) => {
        this.statements.push(sql.trim());
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
        if (sql.includes("SELECT id, email FROM app.users")) {
          return { rows: this.userExists ? [{ id: "user-1", email: "one@example.com" }] : [] };
        }
        if (sql.includes("FROM app.user_restrictions WHERE user_id = $1 FOR UPDATE")) {
          return { rows: this.restriction ? [this.restriction] : [] };
        }
        if (sql.includes("INSERT INTO app.user_restrictions")) {
          if (this.failInsert) throw new Error("database unavailable");
          this.restriction = {
            user_id: params[0],
            reason: params[1],
            blocked_by: params[2],
            blocked_at: new Date("2026-11-03T12:00:00.000Z"),
            reconciliation_required: false,
          };
          return { rows: [this.restriction] };
        }
        if (sql.includes("DELETE FROM app.user_restrictions")) {
          const prior = this.restriction;
          this.restriction = null;
          return { rows: prior ? [prior] : [] };
        }
        if (sql.includes("UPDATE app.organizations")) {
          this.pending = true;
          return { rows: [{ id: "org-1", calendar_status_pending: true }] };
        }
        if (sql.includes("SELECT id, calendar_status_pending FROM app.organizations")) {
          return { rows: [{ id: "org-1", calendar_status_pending: this.pending }] };
        }
        if (sql.includes("INSERT INTO app.audit_log")) {
          this.auditRows.push(String(params[1]));
          return { rows: [] };
        }
        if (sql.includes("DELETE FROM app.oauth_") || sql.includes("DELETE FROM app.sessions")) {
          return { rows: [] };
        }
        throw new Error(`Unexpected SQL in test: ${sql}`);
      },
      release() {},
    };
  }

  async query() {
    return { rows: [] };
  }

  async end() {}
}

function createDatabase(pool: RestrictionPool) {
  return new PlatformDatabase(config, pool as unknown as Pool);
}

describe("PlatformDatabase user restrictions", () => {
  it("is idempotent and leaves the economic organization status unchanged on unblock", async () => {
    const pool = new RestrictionPool();
    const db = createDatabase(pool);
    const firstBlock = await db.setUserRestriction("user-1", "Abuso", "admin");
    const repeatedBlock = await db.setUserRestriction("user-1", "Otro motivo", "admin");
    expect(firstBlock.changed).toBe(true);
    expect(repeatedBlock.changed).toBe(false);
    expect(pool.auditRows).toEqual(["user.restriction.created"]);

    const firstUnblock = await db.removeUserRestriction("user-1", "admin");
    const repeatedUnblock = await db.removeUserRestriction("user-1", "admin");
    expect(firstUnblock.changed).toBe(true);
    expect(repeatedUnblock.changed).toBe(false);
    expect(firstUnblock.calendarStatusPending).toBe(true);
    expect(pool.auditRows).toEqual(["user.restriction.created", "user.restriction.removed"]);
    expect(pool.orgStatus).toBe("read_only");
    expect(pool.statements.some((sql) => /SET status\s*=/.test(sql))).toBe(false);
    await db.close();
  });

  it("returns a defined not-found error and rolls back", async () => {
    const pool = new RestrictionPool();
    pool.userExists = false;
    const db = createDatabase(pool);
    await expect(db.setUserRestriction("missing", "Abuso", "admin")).rejects.toBeInstanceOf(
      PlatformUserNotFoundError,
    );
    expect(pool.statements.at(-1)).toBe("ROLLBACK");
    await db.close();
  });

  it("does not convert a PostgreSQL failure to a successful block", async () => {
    const pool = new RestrictionPool();
    pool.failInsert = true;
    const db = createDatabase(pool);
    await expect(db.setUserRestriction("user-1", "Abuso", "admin")).rejects.toBeInstanceOf(
      PlatformDatabaseUnavailableError,
    );
    expect(pool.statements.at(-1)).toBe("ROLLBACK");
    expect(pool.auditRows).toHaveLength(0);
    await db.close();
  });
});
