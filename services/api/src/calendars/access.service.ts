import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { SessionUser } from "../auth/auth.registry.js";
import { type Action, type CalendarRole, can } from "../auth/permissions.js";
import { type Database, DB } from "../db/db.module.js";
import { calendarMembers } from "../db/schema.js";
import type { ActorClaims } from "../internal-rpc/jwt.js";

export interface Membership {
  calendarId: string;
  orgId: string;
  role: Exclude<CalendarRole, "customer">;
  notify: boolean;
}

/** Rol de cada usuario en cada tablero (calendar_members) y comprobación de la matriz de permisos. */
@Injectable()
export class CalendarAccess {
  constructor(@Inject(DB) private readonly db: Database) {}

  async membership(userId: string, calendarId: string): Promise<Membership | undefined> {
    const [m] = await this.db
      .select()
      .from(calendarMembers)
      .where(and(eq(calendarMembers.userId, userId), eq(calendarMembers.calendarId, calendarId)));
    return m ? { calendarId: m.calendarId, orgId: m.orgId, role: m.role, notify: m.notify } : undefined;
  }

  async memberships(userId: string): Promise<Membership[]> {
    const rows = await this.db.select().from(calendarMembers).where(eq(calendarMembers.userId, userId));
    return rows.map((m) => ({ calendarId: m.calendarId, orgId: m.orgId, role: m.role, notify: m.notify }));
  }

  /** Exige que el usuario pueda hacer `action` en el tablero; 404 si no es miembro (no se revela su existencia). */
  async require(user: SessionUser, calendarId: string, action: Action): Promise<Membership> {
    const m = await this.membership(user.id, calendarId);
    if (!m) throw new NotFoundException({ code: "calendar_not_found", message: "Tablero no encontrado" });
    if (!can(m.role, action))
      throw new ForbiddenException({ code: "permission_denied", message: "Sin permiso" });
    return m;
  }

  /** Actor firmado para el motor. */
  actor(user: SessionUser, m: Pick<Membership, "orgId" | "role" | "calendarId">): ActorClaims {
    return {
      sub: user.id,
      org: m.orgId,
      cal: m.calendarId,
      role: m.role,
      via: "panel",
      loc: user.locale,
      tz: user.timezone,
    };
  }
}
