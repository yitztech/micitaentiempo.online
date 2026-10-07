import { fileURLToPath } from "node:url";
import type { Logger } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";

const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));
/** Clave del bloqueo consultivo: evita que dos arranques migren a la vez. */
const LOCK_KEY = 726_481_001;

export async function runMigrations(pool: pg.Pool, logger: Pick<Logger, "log">): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS, migrationsSchema: "app" });
    logger.log("Esquema app al día");
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}
