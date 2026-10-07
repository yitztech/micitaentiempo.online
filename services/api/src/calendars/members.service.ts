import { createHash, randomBytes } from "node:crypto";
import { CalendarService } from "@mcet/contracts/mcet/calendar/v1/calendar_pb";
import { type Lang, pathFor } from "@mcet/i18n";
import { type Invitation, PLAN_LIMITS } from "@mcet/schemas";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { AuditService } from "../audit/audit.service.js";
import type { SessionUser } from "../auth/auth.registry.js";
import { uuidv7 } from "../auth/ids.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { type Database, DB } from "../db/db.module.js";
import { account, calendarMembers, invitations, organizations, user as users } from "../db/schema.js";
import { asActor, type CalendarClients } from "../internal-rpc/calendar-client.js";
import { CALENDAR } from "../internal-rpc/internal-rpc.module.js";
import { MailService } from "../mail/mail.service.js";
import { invitationEmail } from "../mail/templates/emails.js";
import { checkEmail } from "../security/email-validation.js";
import { CalendarAccess } from "./access.service.js";
import { rpc } from "./rpc-errors.js";

const INVITATION_DAYS = 7;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Miembros por tablero e invitaciones (RF-08 editores con Google, RF-09 observadores). */
@Injectable()
export class MembersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(CALENDAR) private readonly calendar: CalendarClients,
    private readonly access: CalendarAccess,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async list(user: SessionUser, calendarId: string) {
    await this.access.require(user, calendarId, "events.read_all");
    const members = await this.db
      .select({
        userId: calendarMembers.userId,
        role: calendarMembers.role,
        notify: calendarMembers.notify,
        name: users.name,
        email: users.email,
      })
      .from(calendarMembers)
      .innerJoin(users, eq(users.id, calendarMembers.userId))
      .where(eq(calendarMembers.calendarId, calendarId));
    const pending = await this.db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.calendarId, calendarId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      );
    return { members, pending: pending.map((p) => ({ ...p, expiresAt: p.expiresAt.toISOString() })) };
  }

  /** El propietario invita por correo; el idioma del correo es el del dominio desde el que invita. */
  async invite(user: SessionUser, calendarId: string, input: Invitation, lang: Lang) {
    const m = await this.access.require(user, calendarId, "members.manage");
    const check = await checkEmail(input.email, { skipDns: Boolean(this.env.TEST_MODE) });
    if (!check.ok) throw new BadRequestException({ code: check.problem, message: "Correo no válido" });
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, m.orgId));
    if (!org) throw new NotFoundException({ code: "org_not_found" });
    const [{ value: members } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(calendarMembers)
      .where(eq(calendarMembers.calendarId, calendarId));
    const [{ value: pending } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(invitations)
      .where(
        and(
          eq(invitations.calendarId, calendarId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      );
    if (members + pending >= PLAN_LIMITS[org.plan].membersPerCalendar + 1) {
      throw new ConflictException({ code: "members_limit", message: "Límite de miembros del tablero" });
    }
    const token = randomBytes(32).toString("base64url");
    const requiresGoogle = input.role === "editor";
    await this.db.insert(invitations).values({
      id: uuidv7(),
      orgId: m.orgId,
      calendarId,
      email: check.normalized,
      role: input.role,
      tokenHash: hash(token),
      requiresGoogle,
      invitedBy: user.id,
      lang,
      expiresAt: new Date(Date.now() + INVITATION_DAYS * 86_400_000),
    });
    const cal = await rpc(
      this.calendar
        .client(CalendarService)
        .getCalendar({ id: calendarId }, asActor({ actor: this.access.actor(user, m) })),
    );
    const url = `${this.env.site.siteUrl[lang]}${pathFor("invitation", lang, { token })}`;
    const mail = await invitationEmail(lang, {
      inviter: user.name,
      calendar: cal.name,
      role: input.role,
      email: check.normalized,
      url,
      requiresGoogle,
    });
    await this.mail.send({ lang, to: check.normalized, ...mail });
    await this.audit.record({
      orgId: m.orgId,
      actorUserId: user.id,
      via: "panel",
      action: "member.invited",
      target: calendarId,
      metadata: { role: input.role },
    });
    return {
      email: check.normalized,
      role: input.role,
      requiresGoogle,
      ...(this.env.TEST_MODE ? { token } : {}),
    };
  }

  /** Datos públicos de una invitación (para la pantalla de aceptación). */
  async preview(token: string) {
    const inv = await this.find(token);
    return {
      role: inv.role,
      requiresGoogle: inv.requiresGoogle,
      emailHint: inv.email.replace(/^(.).*(@.*)$/, "$1…$2"),
      expiresAt: inv.expiresAt.toISOString(),
    };
  }

  async accept(user: SessionUser, token: string) {
    const inv = await this.find(token);
    if (inv.email !== user.email.toLowerCase()) {
      throw new ForbiddenException({
        code: "invitation_email_mismatch",
        message: "La invitación es para otro correo",
      });
    }
    if (inv.requiresGoogle) {
      const [google] = await this.db
        .select()
        .from(account)
        .where(and(eq(account.userId, user.id), eq(account.providerId, "google")));
      if (!google)
        throw new ForbiddenException({
          code: "google_required",
          message: "Los editores entran con su cuenta de Google",
        });
    }
    await this.db
      .insert(calendarMembers)
      .values({
        calendarId: inv.calendarId,
        orgId: inv.orgId,
        userId: user.id,
        role: inv.role,
        notify: inv.role === "observer",
        addedBy: inv.invitedBy,
      })
      .onConflictDoUpdate({
        target: [calendarMembers.calendarId, calendarMembers.userId],
        set: { role: inv.role },
      });
    await this.db
      .update(invitations)
      .set({ acceptedAt: new Date(), acceptedBy: user.id })
      .where(eq(invitations.id, inv.id));
    await this.audit.record({
      orgId: inv.orgId,
      actorUserId: user.id,
      via: "panel",
      action: "member.joined",
      target: inv.calendarId,
      metadata: { role: inv.role },
    });
    return { calendarId: inv.calendarId, role: inv.role };
  }

  async remove(user: SessionUser, calendarId: string, memberId: string) {
    const m = await this.access.require(user, calendarId, "members.manage");
    if (memberId === user.id)
      throw new BadRequestException({ code: "cannot_remove_owner", message: "El propietario no se quita" });
    await this.db
      .delete(calendarMembers)
      .where(and(eq(calendarMembers.calendarId, calendarId), eq(calendarMembers.userId, memberId)));
    await this.audit.record({
      orgId: m.orgId,
      actorUserId: user.id,
      via: "panel",
      action: "member.removed",
      target: calendarId,
      metadata: { memberId },
    });
  }

  async revoke(user: SessionUser, calendarId: string, invitationId: string) {
    await this.access.require(user, calendarId, "members.manage");
    await this.db
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(invitations.id, invitationId), eq(invitations.calendarId, calendarId)));
  }

  private async find(token: string) {
    const [inv] = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, hash(token)));
    if (!inv || inv.revokedAt)
      throw new NotFoundException({ code: "invitation_not_found", message: "Invitación no válida" });
    if (inv.acceptedAt) throw new GoneException({ code: "invitation_used", message: "Invitación ya usada" });
    if (inv.expiresAt < new Date())
      throw new GoneException({ code: "invitation_expired", message: "Invitación caducada" });
    return inv;
  }
}
