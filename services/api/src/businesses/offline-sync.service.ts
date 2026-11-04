import {
  OFFLINE_RESOURCES,
  OFFLINE_UNSUPPORTED,
  type OfflineChangeItem,
  type OfflineChangesPage,
  type OfflineResource,
  type PrivateLocation,
} from "@mcet/schemas";
import {
  BadRequestException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { resolveEffectiveOrganizationStatus } from "../auth/org-access.js";
import { AppClock } from "../common/clock.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { type Database, DB } from "../db/db.module.js";
import { businessLocations, businessProfiles, organizations } from "../db/schema.js";
import { BusinessProfileService } from "./business-profile.service.js";
import { CursorError, type CursorPosition, decodeCursor, encodeCursor, scopeHash } from "./offline-cursor.js";

/** Días que se conserva `app.sync_changes`; mayor que la vigencia del cursor para no dejar lagunas. */
export const SYNC_RETENTION_DAYS = 31;

type ChangeRow = {
  seq: string;
  txid: string;
  org_id: string;
  resource: OfflineResource;
  resource_id: string;
  op: "upsert" | "delete";
};

/**
 * Feed incremental de `GET /api/offline/changes` (ADR 0020). Nada de lo que se entrega sale del registro de
 * cambios: este solo apunta a recursos, y el contenido se lee al momento con los permisos vigentes.
 */
@Injectable()
export class OfflineSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OfflineSyncService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly clock: AppClock,
    private readonly profiles: BusinessProfileService,
  ) {}

  /** Limpieza horaria del registro de cambios (no corre en pruebas ni en scripts). */
  onModuleInit(): void {
    if (process.env.VITEST || process.argv.some((a) => a.includes("scripts/"))) return;
    this.timer = setInterval(
      () => void this.pruneChanges().catch(() => this.logger.error({ code: "sync_changes_prune_failed" })),
      3_600_000,
    );
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Organizaciones que el actor puede ver por este canal: las que preside, vivas y no suspendidas. */
  private async scopeOf(userId: string): Promise<string[]> {
    const owned = await this.db
      .select()
      .from(organizations)
      .where(and(eq(organizations.ownerUserId, userId), isNull(organizations.deletedAt)));
    const visible: string[] = [];
    for (const org of owned) {
      const { effectiveStatus } = await resolveEffectiveOrganizationStatus(this.db, org);
      if (effectiveStatus !== "suspended") visible.push(org.id);
    }
    return visible;
  }

  /** Transacciones con `txid` menor que este valor ya terminaron: leer solo hasta aquí evita saltarse cambios. */
  private async horizon(): Promise<string> {
    const { rows } = await this.db.execute<{ x: string }>(
      sql`SELECT pg_snapshot_xmin(pg_current_snapshot())::text AS x`,
    );
    return rows[0]?.x ?? "0";
  }

  async page(userId: string, token: string | undefined, limit: number): Promise<OfflineChangesPage> {
    const orgs = await this.scopeOf(userId);
    const scope = scopeHash(orgs);
    const now = this.clock.now();
    const secret = this.env.BETTER_AUTH_SECRET;
    const cursorFor = (position: CursorPosition, exp?: number) =>
      encodeCursor(secret, { actor: userId, scope, position, now, exp });

    let position: CursorPosition | null = null;
    // Plazo de la posición recibida: se hereda mientras no se alcance el horizonte actual (ADR 0020 §6).
    let inheritedExp: number | undefined;
    if (token !== undefined) {
      try {
        ({ position, exp: inheritedExp } = decodeCursor(secret, token, { actor: userId, scope, now }));
      } catch (error) {
        if (!(error instanceof CursorError)) throw error;
        if (error.kind === "invalid") {
          throw new BadRequestException({
            code: "invalid_cursor",
            message: "El cursor no es válido.",
          });
        }
        throw new GoneException({
          code: "sync_cursor_expired",
          message: "El cursor ya no es válido; reinicia la descarga.",
          errors: [{ path: "cursor", code: error.kind }],
        });
      }
    }

    const base = {
      serverTime: now.toISOString(),
      resources: [...OFFLINE_RESOURCES],
      unsupported: [...OFFLINE_UNSUPPORTED],
    };

    if (position === null || position.k === "s") {
      const watermark = position?.w ?? (await this.horizon());
      const { items, last, hasMore } = await this.snapshotItems(orgs, position?.after ?? null, limit);
      return {
        ...base,
        mode: "snapshot",
        reset: position === null,
        snapshotComplete: !hasMore,
        items,
        hasMore,
        nextCursor: cursorFor(
          hasMore ? { k: "s", w: watermark, after: last } : { k: "c", t: watermark, s: 0 },
          inheritedExp,
        ),
      };
    }

    const x = await this.horizon();
    const rows =
      orgs.length === 0
        ? []
        : (
            await this.db.execute<ChangeRow>(sql`
              SELECT seq::text, txid::text, org_id, resource, resource_id, op
              FROM app.sync_changes
              WHERE org_id IN (${sql.join(
                orgs.map((o) => sql`${o}`),
                sql`, `,
              )})
                AND (txid > ${position.t}::xid8 OR (txid = ${position.t}::xid8 AND seq > ${position.s}))
                AND txid < ${x}::xid8
              ORDER BY txid, seq
              LIMIT ${limit + 1}`)
          ).rows;
    const hasMore = rows.length > limit;
    const consumed = rows.slice(0, limit);
    const lastRow = consumed.at(-1);
    return {
      ...base,
      mode: "changes",
      reset: false,
      snapshotComplete: true,
      items: await this.materialize(consumed),
      hasMore,
      nextCursor:
        hasMore && lastRow
          ? cursorFor({ k: "c", t: lastRow.txid, s: Number(lastRow.seq) }, inheritedExp)
          : cursorFor({ k: "c", t: x, s: 0 }),
    };
  }

  /** Estado actual completo, en orden estable de clave (perfiles primero, luego sedes), paginado por clave. */
  private async snapshotItems(orgs: string[], after: string | null, limit: number) {
    if (orgs.length === 0) return { items: [] as OfflineChangeItem[], last: null, hasMore: false };
    const profileRows = await this.db
      .select({ orgId: businessProfiles.orgId })
      .from(businessProfiles)
      .where(inArray(businessProfiles.orgId, orgs));
    const locationRows = await this.db
      .select({ id: businessLocations.id, orgId: businessLocations.orgId })
      .from(businessLocations)
      .where(inArray(businessLocations.orgId, orgs))
      .orderBy(asc(businessLocations.id));
    const keys = [
      ...profileRows.map((r) => ({
        key: `0:${r.orgId}`,
        resource: "business_profile" as const,
        id: r.orgId,
        org: r.orgId,
      })),
      ...locationRows.map((r) => ({
        key: `1:${r.id}`,
        resource: "business_location" as const,
        id: r.id,
        org: r.orgId,
      })),
    ]
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .filter((k) => after === null || k.key > after);
    const hasMore = keys.length > limit;
    const page = keys.slice(0, limit);
    const revisions = await this.revisions(orgs);
    const rows: ChangeRow[] = page.map((k) => ({
      seq: String(revisions.get(`${k.resource}:${k.id}`) ?? 1),
      txid: "0",
      org_id: k.org,
      resource: k.resource,
      resource_id: k.id,
      op: "upsert",
    }));
    return { items: await this.materialize(rows), last: page.at(-1)?.key ?? null, hasMore };
  }

  /** Última revisión (seq) conocida de cada recurso del ámbito. */
  private async revisions(orgs: string[]): Promise<Map<string, number>> {
    const { rows } = await this.db.execute<{ resource: string; resource_id: string; seq: string }>(sql`
      SELECT resource, resource_id, max(seq)::text AS seq
      FROM app.sync_changes
      WHERE org_id IN (${sql.join(
        orgs.map((o) => sql`${o}`),
        sql`, `,
      )})
      GROUP BY resource, resource_id`);
    return new Map(rows.map((r) => [`${r.resource}:${r.resource_id}`, Number(r.seq)]));
  }

  /** Colapsa por recurso (gana el último cambio) y lo convierte en upsert con el contenido actual o en baja. */
  private async materialize(rows: ChangeRow[]): Promise<OfflineChangeItem[]> {
    const latest = new Map<string, ChangeRow>();
    for (const row of rows) latest.set(`${row.resource}:${row.resource_id}`, row);
    const items: OfflineChangeItem[] = [];
    const profileVersions = new Map<string, number>();
    for (const row of latest.values()) {
      const revision = Math.max(1, Number(row.seq));
      if (row.resource === "business_profile") {
        const data = row.op === "delete" ? null : await this.profiles.readPrivateProfile(row.resource_id);
        items.push(
          data
            ? { resource: "business_profile", id: row.resource_id, op: "upsert", revision, data }
            : { resource: "business_profile", id: row.resource_id, op: "delete", revision },
        );
        continue;
      }
      const [location] =
        row.op === "delete"
          ? []
          : await this.db
              .select()
              .from(businessLocations)
              .where(and(eq(businessLocations.id, row.resource_id), eq(businessLocations.orgId, row.org_id)));
      if (!location) {
        items.push({ resource: "business_location", id: row.resource_id, op: "delete", revision });
        continue;
      }
      if (!profileVersions.has(location.orgId)) {
        const [profile] = await this.db
          .select({ version: businessProfiles.version })
          .from(businessProfiles)
          .where(eq(businessProfiles.orgId, location.orgId));
        profileVersions.set(location.orgId, profile?.version ?? 1);
      }
      const data: PrivateLocation = {
        id: location.id,
        version: profileVersions.get(location.orgId) ?? 1,
        location: {
          name: location.name,
          country: location.country as PrivateLocation["location"]["country"],
          region: location.region,
          locality: location.locality,
          address: location.address,
          postalCode: location.postalCode,
          addressVisibility: location.addressVisibility as "public" | "locality",
          latitude: location.latitude,
          longitude: location.longitude,
        },
      };
      items.push({ resource: "business_location", id: location.id, op: "upsert", revision, data });
    }
    return items;
  }

  /** Borra el registro más antiguo que la retención. Seguro: ningún cursor vigente llega tan atrás. */
  async pruneChanges(): Promise<number> {
    const result = await this.db.execute(
      sql`DELETE FROM app.sync_changes WHERE created_at < ${this.clock.now()}::timestamptz - make_interval(days => ${SYNC_RETENTION_DAYS})`,
    );
    return result.rowCount ?? 0;
  }
}
