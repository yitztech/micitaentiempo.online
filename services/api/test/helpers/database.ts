import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type pg from "pg";

/**
 * `pool.end()` resuelve antes de que los clientes cierren su socket. Parar el contenedor en ese momento hace que
 * PostgreSQL les envíe 57P01, un error sin manejar que Vitest cuenta como fallo aunque todas las pruebas pasen.
 */
export async function stopDatabase(pool?: pg.Pool, container?: StartedPostgreSqlContainer): Promise<void> {
  if (pool) {
    let open = pool.totalCount;
    const closed = new Promise<void>((resolve) => {
      if (open === 0) resolve();
      pool.on("remove", () => {
        open -= 1;
        if (open === 0) resolve();
      });
    });
    await pool.end();
    await closed;
  }
  await container?.stop();
}
