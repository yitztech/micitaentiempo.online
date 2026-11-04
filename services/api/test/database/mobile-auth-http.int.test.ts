import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthRegistry } from "../../src/auth/auth.registry.js";
import { ProblemFilter } from "../../src/common/problem.filter.js";
import { ENV } from "../../src/config/config.module.js";
import type { Env } from "../../src/config/env.js";
import { DB } from "../../src/db/db.module.js";
import { runMigrations } from "../../src/db/migrate.js";
import * as schema from "../../src/db/schema.js";
import { PublicMobileController } from "../../src/mobile/mobile.controller.js";
import { MOBILE_AUTH_RULES, MobileAuthLimiter } from "../../src/mobile/mobile-auth-limiter.js";
import { stopDatabase } from "../helpers/database.js";

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let app: NestFastifyApplication;

// Sin TEST_MODE: los límites están activos, como en producción.
const env = {
  BETTER_AUTH_SECRET: "secreto-de-prueba-del-limitador-0123456789",
  site: {
    primary: "es",
    siteUrl: { es: "https://es.example", en: "https://en.example" },
    hosts: new Map(),
  },
} as unknown as Env;

const registry = {
  forRequest: () => ({
    api: {
      signInEmail: async () => ({
        headers: new Headers({ "set-auth-token": "token-de-prueba" }),
        response: { user: { id: "u1", email: "ana@example.com", name: "Ana" } },
      }),
    },
  }),
};

// Vitest no emite los metadatos de los decoradores; `main.ts` sí los tiene al compilar.
Reflect.defineMetadata(
  "design:paramtypes",
  [AuthRegistry, Object, Object, MobileAuthLimiter],
  PublicMobileController,
);

function signIn(ip: string, email: string) {
  return app.inject({
    method: "POST",
    url: "/api/public/v1/mobile/auth/sign-in",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, "x-app-locale": "en" },
    payload: { email, password: "contrasena-larga-de-prueba" },
  });
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.6-alpine3.24").start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await runMigrations(pool, { log() {} });
  const db = drizzle(pool, { schema });

  @Module({
    controllers: [PublicMobileController],
    providers: [
      { provide: AuthRegistry, useValue: registry },
      { provide: ENV, useValue: env },
      { provide: DB, useValue: db },
      { provide: MobileAuthLimiter, useValue: new MobileAuthLimiter(db as never, env) },
    ],
  })
  class HttpTestModule {}

  app = await NestFactory.create<NestFastifyApplication>(
    HttpTestModule,
    new FastifyAdapter({ trustProxy: (_address, hop) => hop < 1 }),
    { logger: false },
  );
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new ProblemFilter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

beforeEach(async () => {
  await pool.query("DELETE FROM app.rate_limits");
});

afterAll(async () => {
  await app?.close();
  await stopDatabase(pool, container);
});

describe("S08 — límite de autenticación móvil por HTTP (Fastify, filtro y PostgreSQL reales)", () => {
  it("el intento siguiente al máximo responde 429 con Retry-After y problem+json", async () => {
    const { max, windowSeconds } = MOBILE_AUTH_RULES["sign-in"];
    for (let i = 0; i < max; i++) {
      expect((await signIn("203.0.113.5", "ana@example.com")).statusCode).toBe(201);
    }

    const rejected = await signIn("203.0.113.5", "ana@example.com");

    expect(rejected.statusCode).toBe(429);
    expect(rejected.headers["content-type"]).toContain("application/problem+json");
    expect(rejected.headers["content-language"]).toBe("en");
    const retryAfter = Number(rejected.headers["retry-after"]);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(windowSeconds);
    expect(rejected.json()).toMatchObject({ status: 429, code: "rate_limited" });
    expect(rejected.body).not.toContain("Retry-After");
  });

  it("toma la IP del gateway: otra IP y otra cuenta siguen pasando", async () => {
    const { max } = MOBILE_AUTH_RULES["sign-in"];
    for (let i = 0; i <= max; i++) await signIn("203.0.113.6", "ana@example.com");
    expect((await signIn("203.0.113.6", "ana@example.com")).statusCode).toBe(429);
    expect((await signIn("198.51.100.7", "otra@example.com")).statusCode).toBe(201);
  });
});
