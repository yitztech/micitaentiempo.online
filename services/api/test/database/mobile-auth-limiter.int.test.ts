import { HttpException } from "@nestjs/common";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../../src/config/env.js";
import { runMigrations } from "../../src/db/migrate.js";
import * as schema from "../../src/db/schema.js";
import { MOBILE_AUTH_RULES, MobileAuthLimiter } from "../../src/mobile/mobile-auth-limiter.js";
import { stopDatabase } from "../helpers/database.js";

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let limiter: MobileAuthLimiter;
let clock = 1_800_000_000_000;

// Sin TEST_MODE: los límites están activos, como en producción.
const env = { BETTER_AUTH_SECRET: "secreto-de-prueba-del-limitador-0123456789" } as unknown as Env;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.6-alpine3.24").start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await runMigrations(pool, { log() {} });
  limiter = new MobileAuthLimiter(drizzle(pool, { schema }) as never, env);
  limiter.now = () => clock;
});

beforeEach(async () => {
  await pool.query("DELETE FROM app.rate_limits");
  clock += 24 * 60 * 60 * 1000;
});

afterAll(async () => {
  await stopDatabase(pool, container);
});

async function rejection(promise: Promise<void>): Promise<HttpException | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    return error as HttpException;
  }
}

describe("límites de autenticación móvil (PostgreSQL real, límites activos)", () => {
  it("el intento siguiente al máximo devuelve 429 con Retry-After", async () => {
    const { max, windowSeconds } = MOBILE_AUTH_RULES["sign-in"];
    for (let i = 0; i < max; i++) await limiter.hit("sign-in", "203.0.113.5", "ana@example.com");
    const error = await rejection(limiter.hit("sign-in", "203.0.113.5", "ana@example.com"));
    expect(error?.getStatus()).toBe(429);
    const body = error?.getResponse() as { code: string; headers: Record<string, string> };
    expect(body.code).toBe("rate_limited");
    expect(Number(body.headers["Retry-After"])).toBeGreaterThan(0);
    expect(Number(body.headers["Retry-After"])).toBeLessThanOrEqual(windowSeconds);
  });

  it("cambiar de IP no libera el límite de la cuenta", async () => {
    const { max } = MOBILE_AUTH_RULES["sign-in"];
    for (let i = 0; i < max; i++) await limiter.hit("sign-in", `198.51.100.${i}`, "ana@example.com");
    const error = await rejection(limiter.hit("sign-in", "198.51.100.200", "ANA@example.com "));
    expect(error?.getStatus()).toBe(429);
  });

  it("cambiar de cuenta no libera el límite de la IP", async () => {
    const { max } = MOBILE_AUTH_RULES["sign-in"];
    for (let i = 0; i < max; i++) await limiter.hit("sign-in", "203.0.113.9", `persona${i}@example.com`);
    const error = await rejection(limiter.hit("sign-in", "203.0.113.9", "otra@example.com"));
    expect(error?.getStatus()).toBe(429);
  });

  it("no distingue cuentas existentes de inexistentes y otra IP y cuenta no se ven afectadas", async () => {
    const { max } = MOBILE_AUTH_RULES["sign-in"];
    for (let i = 0; i < max; i++) await limiter.hit("sign-in", "203.0.113.20", "ana@example.com");
    await expect(limiter.hit("sign-in", "203.0.113.21", "beto@example.com")).resolves.toBeUndefined();
  });

  it("tras la ventana vuelve a permitir", async () => {
    const { max, windowSeconds } = MOBILE_AUTH_RULES["sign-in"];
    for (let i = 0; i < max; i++) await limiter.hit("sign-in", "203.0.113.30", "ana@example.com");
    expect((await rejection(limiter.hit("sign-in", "203.0.113.30", "ana@example.com")))?.getStatus()).toBe(
      429,
    );
    clock += windowSeconds * 1000;
    await expect(limiter.hit("sign-in", "203.0.113.30", "ana@example.com")).resolves.toBeUndefined();
  });

  it("registro y recuperación tienen su propio contador, de una hora", async () => {
    for (const action of ["sign-up", "forgot-password"] as const) {
      const { max } = MOBILE_AUTH_RULES[action];
      for (let i = 0; i < max; i++) await limiter.hit(action, "203.0.113.40", "ana@example.com");
      expect((await rejection(limiter.hit(action, "203.0.113.40", "ana@example.com")))?.getStatus()).toBe(
        429,
      );
    }
    // El inicio de sesión de esa misma IP/cuenta no se ve afectado.
    await expect(limiter.hit("sign-in", "203.0.113.40", "ana@example.com")).resolves.toBeUndefined();
  });

  it("las peticiones simultáneas nunca superan el máximo", async () => {
    const { max } = MOBILE_AUTH_RULES["sign-in"];
    const results = await Promise.all(
      Array.from({ length: max + 5 }, () =>
        rejection(limiter.hit("sign-in", "203.0.113.50", "ana@example.com")),
      ),
    );
    // Los contadores de IP y cuenta avanzan por separado: en paralelo pueden permitir menos de `max`, nunca más.
    const allowed = results.filter((r) => r === null).length;
    expect(allowed).toBeLessThanOrEqual(max);
    expect(results.filter((r) => r?.getStatus() === 429)).toHaveLength(max + 5 - allowed);
    expect((await rejection(limiter.hit("sign-in", "203.0.113.50", "ana@example.com")))?.getStatus()).toBe(
      429,
    );
  });

  it("no guarda el correo en claro", async () => {
    await limiter.hit("sign-in", "203.0.113.60", "secreto.persona@example.com");
    const { rows } = await pool.query("SELECT key FROM app.rate_limits");
    expect(JSON.stringify(rows)).not.toContain("secreto.persona");
  });
});
