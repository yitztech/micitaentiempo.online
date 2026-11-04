import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/db.module.js";
import { organizations, user, userRestriction } from "../db/schema.js";

export type EffectiveOrgStatus = "trialing" | "active" | "past_due" | "read_only" | "suspended";

export interface EffectiveOrganizationAccess {
  id: string;
  ownerUserId: string;
  economicStatus: EffectiveOrgStatus;
  effectiveStatus: EffectiveOrgStatus;
  ownerRestricted: boolean;
  calendarStatusPending: boolean;
}

export function deriveEffectiveOrganizationStatus(
  economicStatus: string | null | undefined,
  ownerRestricted = false,
): EffectiveOrgStatus | null {
  if (!economicStatus) return null;
  if (ownerRestricted || economicStatus === "suspended") return "suspended";
  return economicStatus as EffectiveOrgStatus;
}

export function canWriteOrganization(status: string | null | undefined, ownerRestricted = false): boolean {
  const effective = deriveEffectiveOrganizationStatus(status, ownerRestricted);
  return effective === "trialing" || effective === "active" || effective === "past_due";
}

export function requireOrganizationWrite(status: string | null | undefined, ownerRestricted = false): void {
  const effective = deriveEffectiveOrganizationStatus(status, ownerRestricted);
  if (effective === "suspended") {
    throw new ForbiddenException({
      code: "org_suspended",
      message: "Organización suspendida",
    });
  }
  if (!effective || !canWriteOrganization(effective, ownerRestricted)) {
    throw new ForbiddenException({
      code: "org_read_only",
      message: "Organización en solo lectura",
    });
  }
}

export async function isUserRestricted(db: Pick<Database, "select">, userId: string): Promise<boolean> {
  if (!userId) return false;
  const rows = await db
    .select({ userId: userRestriction.userId })
    .from(userRestriction)
    .where(eq(userRestriction.userId, userId));
  return rows.some((row) => typeof row?.userId === "string" && row.userId.length > 0);
}

export async function isEmailRestricted(db: Pick<Database, "select">, email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.email, normalized));
  const foundId = rows.find((row) => typeof row?.id === "string" && row.id.length > 0)?.id;
  if (!foundId) return false;
  return isUserRestricted(db, foundId);
}

export async function requireUnrestrictedUser(db: Pick<Database, "select">, userId: string): Promise<void> {
  if (await isUserRestricted(db, userId)) {
    throw new UnauthorizedException({
      code: "unauthenticated",
      message: "Sesión no válida",
    });
  }
}

export async function resolveEffectiveOrganizationStatus(
  db: Pick<Database, "select">,
  org: { status: string; ownerUserId?: string | null },
): Promise<{ effectiveStatus: EffectiveOrgStatus; ownerRestricted: boolean }> {
  if (org.status === "suspended") {
    return { effectiveStatus: "suspended", ownerRestricted: true };
  }
  const ownerRestricted = org.ownerUserId ? await isUserRestricted(db, org.ownerUserId) : false;
  const effectiveStatus = deriveEffectiveOrganizationStatus(org.status, ownerRestricted) ?? "suspended";
  return { effectiveStatus, ownerRestricted };
}

export async function getEffectiveOrganizationAccess(
  db: Pick<Database, "select">,
  orgId: string,
): Promise<EffectiveOrganizationAccess | null> {
  const [org] = await db
    .select({
      id: organizations.id,
      ownerUserId: organizations.ownerUserId,
      status: organizations.status,
      calendarStatusPending: organizations.calendarStatusPending,
    })
    .from(organizations)
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)));
  if (!org) return null;
  const { effectiveStatus, ownerRestricted } = await resolveEffectiveOrganizationStatus(db, org);
  return {
    id: org.id,
    ownerUserId: org.ownerUserId,
    economicStatus: org.status,
    effectiveStatus,
    ownerRestricted,
    calendarStatusPending: Boolean(org.calendarStatusPending),
  };
}
