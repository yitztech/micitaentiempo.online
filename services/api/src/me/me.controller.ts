import { UpdateMe } from "@mcet/schemas";
import { Body, ConflictException, Controller, Delete, Get, Inject, Patch, Req } from "@nestjs/common";
import { and, eq, isNotNull } from "drizzle-orm";
import { AuditService } from "../audit/audit.service.js";
import { type AuthedRequest, CurrentUser } from "../auth/auth.guard.js";
import { AuthRegistry, type SessionUser } from "../auth/auth.registry.js";
import { toHeaders } from "../common/request.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { type Database, DB } from "../db/db.module.js";
import { calendarMembers, customerLinks, organizations, user as users } from "../db/schema.js";
import { OrgsService } from "../orgs/orgs.service.js";

@Controller("v1/me")
export class MeController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly orgs: OrgsService,
    private readonly registry: AuthRegistry,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async me(@CurrentUser() current: SessionUser) {
    const [u] = await this.db.select().from(users).where(eq(users.id, current.id));
    const org = await this.orgs.findByOwner(current.id);
    const memberships = await this.db
      .select({
        calendarId: calendarMembers.calendarId,
        role: calendarMembers.role,
        orgId: calendarMembers.orgId,
      })
      .from(calendarMembers)
      .where(eq(calendarMembers.userId, current.id));
    return {
      id: current.id,
      name: u?.name,
      email: u?.email,
      locale: u?.locale,
      timezone: u?.timezone,
      timeFormat: u?.timeFormat,
      weekStart: u?.weekStart,
      country: u?.country,
      twoFactorEnabled: u?.twoFactorEnabled ?? false,
      organization: org ? { id: org.id, name: org.name, plan: org.plan, status: org.status } : null,
      memberships,
    };
  }

  @Patch()
  async update(@CurrentUser() current: SessionUser, @Body(new ZodPipe(UpdateMe)) body: UpdateMe) {
    if (Object.keys(body).length) await this.db.update(users).set(body).where(eq(users.id, current.id));
    return this.me(current);
  }

  /** Exportación de los datos personales (RNF-06). */
  @Get("export")
  async export(@CurrentUser() current: SessionUser) {
    const [u] = await this.db.select().from(users).where(eq(users.id, current.id));
    const org = await this.orgs.findByOwner(current.id);
    const memberships = await this.db
      .select()
      .from(calendarMembers)
      .where(eq(calendarMembers.userId, current.id));
    const businesses = await this.db.select().from(customerLinks).where(eq(customerLinks.userId, current.id));
    return {
      exportedAt: new Date().toISOString(),
      user: u,
      organization: org ?? null,
      memberships,
      businesses,
    };
  }

  /** Borra la cuenta. Un propietario con organización activa debe cerrarla antes. */
  @Delete()
  async remove(@CurrentUser() current: SessionUser, @Req() req: AuthedRequest) {
    const org = await this.orgs.findByOwner(current.id);
    if (org) {
      throw new ConflictException({
        code: "owner_has_org",
        message: "Cierra tu organización antes de borrar la cuenta",
      });
    }
    await this.audit.record({ actorUserId: current.id, via: "panel", action: "user.deleted", ip: req.ip });
    await this.registry.forRequest(req).api.revokeSessions({ headers: toHeaders(req.headers) });
    // Las organizaciones ya cerradas del propietario se borran con la cuenta (sus datos ya no existen).
    await this.db
      .delete(organizations)
      .where(and(eq(organizations.ownerUserId, current.id), isNotNull(organizations.deletedAt)));
    await this.db.delete(users).where(eq(users.id, current.id));
    return { deleted: true };
  }
}
