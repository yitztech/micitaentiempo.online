import { timestampDate } from "@bufbuild/protobuf/wkt";
import {
  CalendarService,
  type ListCalendarSnapshotsResponse,
} from "@mcet/contracts/mcet/calendar/v1/calendar_pb";
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
} from "@nestjs/common";
import { eq, isNull } from "drizzle-orm";
import { rpc } from "../calendars/rpc-errors.js";
import { type Database, DB } from "../db/db.module.js";
import { calendarMembers, organizations, systemInfo } from "../db/schema.js";
import { asActor, type CalendarClients } from "../internal-rpc/calendar-client.js";
import { CALENDAR } from "../internal-rpc/internal-rpc.module.js";
import { BusinessProfileRepository } from "./business-profile.repository.js";

const CHECKPOINT = "business_profiles_backfill_cursor";

/** Bounded recurring repair: one keyset page per minute, restart-safe and idempotent. */
@Injectable()
export class BusinessBackfill implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BusinessBackfill.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private active: Promise<void> | undefined;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly profiles: BusinessProfileRepository,
    @Optional() @Inject(CALENDAR) private readonly calendar?: CalendarClients,
  ) {}

  onModuleInit(): void {
    if (process.env.VITEST || process.argv.some((a) => a.includes("scripts/"))) return;
    const run = () => {
      if (this.running) return;
      this.active = this.sweep().catch(() => this.logger.error({ code: "business_backfill_failed" }));
    };
    run();
    this.timer = setInterval(run, 60000);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.active;
  }

  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const [checkpoint] = await this.db.select().from(systemInfo).where(eq(systemInfo.key, CHECKPOINT));
      const result = await this.profiles.backfillPage(checkpoint?.value || null);
      // A crash before checkpointing repeats the committed page safely. End resets the next sweep.
      await this.db
        .insert(systemInfo)
        .values({ key: CHECKPOINT, value: result.nextCursor ?? "" })
        .onConflictDoUpdate({
          target: systemInfo.key,
          set: { value: result.nextCursor ?? "", updatedAt: new Date() },
        });

      if (this.calendar) {
        const orgs = await this.db
          .select({ id: organizations.id, ownerUserId: organizations.ownerUserId })
          .from(organizations)
          .where(isNull(organizations.deletedAt))
          .limit(20);
        for (const org of orgs) {
          await this.reconcileOrg(org.id, org.ownerUserId);
        }
      }
    } finally {
      this.running = false;
    }
  }

  async reconcileOrg(orgId: string, ownerUserId?: string): Promise<void> {
    if (!this.calendar) return;
    try {
      const client = this.calendar.client(CalendarService);
      let cursor = "";
      for (let page = 0; page < 5; page++) {
        const res: ListCalendarSnapshotsResponse = await rpc(
          client.listCalendarSnapshots(
            { orgId, limit: 100, cursor },
            asActor({ actor: { role: "system", via: "system" } }),
          ),
        );
        for (const snap of res.snapshots) {
          await this.profiles.applyCalendarSnapshot({
            eventId: snap.calendarId,
            schemaVersion: 1,
            aggregateVersion: snap.aggregateVersion,
            occurredAt: snap.updatedAt
              ? timestampDate(snap.updatedAt).toISOString()
              : new Date().toISOString(),
            businessId: snap.orgId,
            calendarId: snap.calendarId,
            state: snap.state,
            slug: snap.slug,
            hasActiveServices: snap.hasActiveServices,
          });
          if (ownerUserId && snap.state !== "deleted") {
            await this.db
              .insert(calendarMembers)
              .values({
                calendarId: snap.calendarId,
                orgId,
                userId: ownerUserId,
                role: "owner",
                notify: true,
                addedBy: ownerUserId,
              })
              .onConflictDoNothing();
          }
        }
        if (!res.nextCursor) break;
        cursor = res.nextCursor;
      }
    } catch (err) {
      this.logger.warn(
        { orgId, err: String(err) },
        "reconciliación de snapshots no disponible temporalmente",
      );
    }
  }
}
