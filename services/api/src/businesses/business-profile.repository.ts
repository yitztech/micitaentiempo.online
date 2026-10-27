import { BusinessCalendarProjectionEvent } from "@mcet/schemas";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { type Database, DB } from "../db/db.module.js";
import {
  businessCalendarProjection,
  businessProfiles,
  calendarMembers,
  organizations,
} from "../db/schema.js";

/** Internal persistence only; C2 adds authorized HTTP DTOs, translated errors and audit. */
@Injectable()
export class BusinessProfileRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Owner lookup and insert share the organization lock, so repeated repair never duplicates profiles. */
  async ensureOwnerDraft(userId: string) {
    return this.db.transaction(async (tx) => {
      const [org] = await tx
        .select()
        .from(organizations)
        .where(and(eq(organizations.ownerUserId, userId), isNull(organizations.deletedAt)))
        .for("update");
      if (!org) return undefined;
      await tx
        .insert(businessProfiles)
        .values({ orgId: org.id, displayName: org.name })
        .onConflictDoNothing();
      const [profile] = await tx.select().from(businessProfiles).where(eq(businessProfiles.orgId, org.id));
      return profile;
    });
  }

  async findByOwner(userId: string) {
    const [result] = await this.db
      .select({ profile: businessProfiles })
      .from(businessProfiles)
      .innerJoin(organizations, eq(organizations.id, businessProfiles.orgId))
      .where(and(eq(organizations.ownerUserId, userId), isNull(organizations.deletedAt)));
    return result?.profile;
  }

  /** One resumable keyset page. Caller persists nextCursor only after this transaction commits. */
  async backfillPage(cursor: string | null, limit = 100) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("invalid_backfill_limit");
    return this.db.transaction(async (tx) => {
      const orgs = await tx
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(
          and(
            isNull(organizations.deletedAt),
            cursor ? gt(organizations.id, cursor) : undefined,
            sql`exists (select 1 from ${calendarMembers} where ${calendarMembers.orgId} = ${organizations.id})`,
          ),
        )
        .orderBy(asc(organizations.id))
        .limit(limit + 1);
      const page = orgs.slice(0, limit);
      if (page.length)
        await tx
          .insert(businessProfiles)
          .values(page.map((o) => ({ orgId: o.id, displayName: o.name })))
          .onConflictDoNothing();
      return { processed: page.length, nextCursor: orgs.length > limit ? (page.at(-1)?.id ?? null) : null };
    });
  }

  /** Authenticated ingress only. Reject a calendar being moved to another business, even at a newer revision. */
  async applyCalendarSnapshot(input: unknown) {
    const snapshot = BusinessCalendarProjectionEvent.parse(input);
    return this.db.transaction(async (tx) => {
      const [org] = await tx
        .select()
        .from(organizations)
        .where(and(eq(organizations.id, snapshot.businessId), isNull(organizations.deletedAt)))
        .for("update");
      if (!org) return false; // Never resurrect a deleted organization from a delayed event.
      await tx
        .insert(businessProfiles)
        .values({ orgId: org.id, displayName: org.name })
        .onConflictDoNothing();
      const updated = await tx
        .insert(businessCalendarProjection)
        .values({
          calendarId: snapshot.calendarId,
          orgId: org.id,
          aggregateVersion: snapshot.aggregateVersion,
          state: snapshot.state,
          slug: snapshot.slug,
          hasActiveServices: snapshot.hasActiveServices,
        })
        .onConflictDoUpdate({
          target: businessCalendarProjection.calendarId,
          set: {
            aggregateVersion: snapshot.aggregateVersion,
            state: snapshot.state,
            slug: snapshot.slug,
            hasActiveServices: snapshot.hasActiveServices,
            updatedAt: new Date(),
          },
          setWhere: and(
            eq(businessCalendarProjection.orgId, org.id),
            sql`${businessCalendarProjection.aggregateVersion} < ${snapshot.aggregateVersion}`,
          ),
        })
        .returning({ calendarId: businessCalendarProjection.calendarId });
      return updated.length === 1;
    });
  }
}
