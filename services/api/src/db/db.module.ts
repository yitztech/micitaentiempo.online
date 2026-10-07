import { Global, Inject, Logger, Module, type OnApplicationShutdown } from "@nestjs/common";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { runMigrations } from "./migrate.js";
import * as schema from "./schema.js";

export const PG_POOL = Symbol("PG_POOL");
export const DB = Symbol("DB");
export type Database = NodePgDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ENV],
      useFactory: async (env: Env): Promise<pg.Pool> => {
        const pool = new pg.Pool({
          host: env.DB_HOST,
          port: env.DB_PORT,
          database: env.DB_NAME,
          user: env.DB_USER,
          password: env.DB_PASSWORD,
          max: env.DB_POOL_MAX,
          application_name: "api",
        });
        await runMigrations(pool, new Logger("Migraciones"));
        return pool;
      },
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (pool: pg.Pool): Database => drizzle(pool, { schema }),
    },
  ],
  exports: [PG_POOL, DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
