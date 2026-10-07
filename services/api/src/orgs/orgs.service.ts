import { type CreateOrg, PLAN_LIMITS, TRIAL_DAYS, type UpdateOrg } from "@mcet/schemas";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { AuditService } from "../audit/audit.service.js";
import { uuidv7 } from "../auth/ids.js";
import { type Database, DB } from "../db/db.module.js";
import { organizations } from "../db/schema.js";

export type Organization = typeof organizations.$inferSelect;

@Injectable()
export class OrgsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async findByOwner(userId: string): Promise<Organization | undefined> {
    const [org] = await this.db
      .select()
      .from(organizations)
      .where(and(eq(organizations.ownerUserId, userId), isNull(organizations.deletedAt)));
    return org;
  }

  async requireByOwner(userId: string): Promise<Organization> {
    const org = await this.findByOwner(userId);
    if (!org) throw new NotFoundException({ code: "org_not_found", message: "Sin organización" });
    return org;
  }

  /** Alta del negocio: elige plan y empieza la prueba de 30 días sin tarjeta (RF-03). */
  async create(userId: string, input: CreateOrg, now = new Date()): Promise<Organization> {
    if (await this.findByOwner(userId)) {
      throw new ConflictException({ code: "org_exists", message: "Ya tienes una organización" });
    }
    const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const [org] = await this.db
      .insert(organizations)
      .values({
        id: uuidv7(),
        name: input.name,
        plan: input.plan,
        country: input.country ?? null,
        ownerUserId: userId,
        status: "trialing",
        trialEndsAt,
      })
      .returning();
    if (!org) throw new Error("no se creó la organización");
    await this.audit.record({
      orgId: org.id,
      actorUserId: userId,
      via: "panel",
      action: "org.created",
      metadata: { plan: input.plan },
    });
    return org;
  }

  async update(userId: string, input: UpdateOrg): Promise<Organization> {
    const org = await this.requireByOwner(userId);
    const [updated] = await this.db
      .update(organizations)
      .set(input)
      .where(eq(organizations.id, org.id))
      .returning();
    return updated ?? org;
  }

  limits(org: Pick<Organization, "plan">) {
    return PLAN_LIMITS[org.plan];
  }
}
