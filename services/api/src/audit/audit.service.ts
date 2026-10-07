import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { uuidv7 } from "../auth/ids.js";
import { type Database, DB } from "../db/db.module.js";
import { auditLog } from "../db/schema.js";

export interface AuditEntry {
  orgId?: string | null;
  actorUserId?: string | null;
  via: "panel" | "public" | "mcp" | "system";
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/** Registro de acciones sensibles. La IP se guarda como hash, nunca en claro. */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.insert(auditLog).values({
      id: uuidv7(),
      orgId: entry.orgId ?? null,
      actorUserId: entry.actorUserId ?? null,
      via: entry.via,
      action: entry.action,
      target: entry.target ?? null,
      metadata: entry.metadata ?? null,
      ipHash: entry.ip ? createHash("sha256").update(entry.ip).digest("hex").slice(0, 32) : null,
    });
  }
}
