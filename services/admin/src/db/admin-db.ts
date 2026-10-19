import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AdminConfig } from "../config.js";

export interface AdminUser {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
}

export interface AdminSession {
  token: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

export interface BlockedUser {
  user_id: string;
  email: string;
  reason: string;
  blocked_at: string;
  blocked_by: string;
}

export interface AuditLog {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  admin_user: string;
  created_at: string;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, originalHash] = storedHash.split(":");
    if (!salt || !originalHash) return false;
    const computedHash = scryptSync(password, salt, 64).toString("hex");
    const a = Buffer.from(computedHash, "hex");
    const b = Buffer.from(originalHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export class AdminDatabase {
  private db: DatabaseSync;

  constructor(filePath: string, initialUser?: string, initialPassword?: string) {
    if (filePath !== ":memory:") {
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(filePath);
    this.initTables();
    if (initialUser && initialPassword) {
      this.seedInitialUser(initialUser, initialPassword);
    }
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_blocked_users (
        user_id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        reason TEXT NOT NULL,
        blocked_at TEXT NOT NULL,
        blocked_by TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        details TEXT NOT NULL,
        admin_user TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_logs(created_at DESC);
    `);
  }

  private seedInitialUser(username: string, password: string): void {
    const existing = this.db.prepare("SELECT id FROM admin_users WHERE username = ?").get(username);
    if (!existing) {
      const id = randomUUID();
      const pHash = hashPassword(password);
      const now = new Date().toISOString();
      this.db
        .prepare("INSERT INTO admin_users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)")
        .run(id, username, pHash, now);
      this.addAuditLog(
        "ADMIN_USER_INITIALIZED",
        "admin_user",
        username,
        "Usuario administrador predeterminado creado",
        "system",
      );
    }
  }

  getUserByUsername(username: string): AdminUser | undefined {
    return this.db.prepare("SELECT * FROM admin_users WHERE username = ?").get(username) as unknown as
      | AdminUser
      | undefined;
  }

  createSession(userId: string): AdminSession {
    const token = randomBytes(32).toString("hex");
    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 días
    const session: AdminSession = {
      token,
      user_id: userId,
      created_at: now.toISOString(),
      expires_at: expires.toISOString(),
    };
    this.db
      .prepare("INSERT INTO admin_sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(session.token, session.user_id, session.created_at, session.expires_at);
    return session;
  }

  getSession(token: string): AdminSession | undefined {
    const session = this.db.prepare("SELECT * FROM admin_sessions WHERE token = ?").get(token) as unknown as
      | AdminSession
      | undefined;
    if (!session) return undefined;
    if (new Date(session.expires_at).getTime() < Date.now()) {
      this.deleteSession(token);
      return undefined;
    }
    return session;
  }

  deleteSession(token: string): void {
    this.db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(token);
  }

  blockUser(userId: string, email: string, reason: string, adminUser: string): BlockedUser {
    const now = new Date().toISOString();
    const record: BlockedUser = {
      user_id: userId,
      email,
      reason: reason || "Bloqueado por administración",
      blocked_at: now,
      blocked_by: adminUser,
    };
    this.db
      .prepare(
        `INSERT INTO admin_blocked_users (user_id, email, reason, blocked_at, blocked_by)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           reason = excluded.reason,
           blocked_at = excluded.blocked_at,
           blocked_by = excluded.blocked_by`,
      )
      .run(record.user_id, record.email, record.reason, record.blocked_at, record.blocked_by);
    this.addAuditLog(
      "USER_BLOCKED",
      "user",
      userId,
      `Usuario ${email} bloqueado. Motivo: ${record.reason}`,
      adminUser,
    );
    return record;
  }

  unblockUser(userId: string, adminUser: string): boolean {
    const user = this.db
      .prepare("SELECT * FROM admin_blocked_users WHERE user_id = ?")
      .get(userId) as unknown as BlockedUser | undefined;
    if (!user) return false;
    this.db.prepare("DELETE FROM admin_blocked_users WHERE user_id = ?").run(userId);
    this.addAuditLog("USER_UNBLOCKED", "user", userId, `Usuario ${user.email} desbloqueado`, adminUser);
    return true;
  }

  getBlockedUsers(): BlockedUser[] {
    return this.db
      .prepare("SELECT * FROM admin_blocked_users ORDER BY blocked_at DESC")
      .all() as unknown as BlockedUser[];
  }

  isUserBlocked(userId: string): boolean {
    const res = this.db.prepare("SELECT user_id FROM admin_blocked_users WHERE user_id = ?").get(userId);
    return Boolean(res);
  }

  addAuditLog(
    action: string,
    targetType: string,
    targetId: string,
    details: string,
    adminUser: string,
  ): AuditLog {
    const id = randomUUID();
    const now = new Date().toISOString();
    const log: AuditLog = {
      id,
      action,
      target_type: targetType,
      target_id: targetId,
      details,
      admin_user: adminUser,
      created_at: now,
    };
    this.db
      .prepare(
        "INSERT INTO admin_audit_logs (id, action, target_type, target_id, details, admin_user, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(log.id, log.action, log.target_type, log.target_id, log.details, log.admin_user, log.created_at);
    return log;
  }

  getAuditLogs(limit = 100): AuditLog[] {
    return this.db
      .prepare("SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT ?")
      .all(limit) as unknown as AuditLog[];
  }

  close(): void {
    this.db.close();
  }
}

export function createAdminDatabase(config: AdminConfig): AdminDatabase {
  return new AdminDatabase(config.sqliteFile, config.initialAdminUser, config.initialAdminPassword);
}
