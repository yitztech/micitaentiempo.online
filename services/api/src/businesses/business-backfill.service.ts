import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { type Database, DB } from "../db/db.module.js";
import { systemInfo } from "../db/schema.js";
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
    } finally {
      this.running = false;
    }
  }
}
