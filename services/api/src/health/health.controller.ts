import { Controller, Get, Header, Inject, Res, ServiceUnavailableException } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import type pg from "pg";
import { Public } from "../auth/auth.guard.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { PG_POOL } from "../db/db.module.js";

@Controller()
export class HealthController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(PG_POOL) private readonly pool: pg.Pool,
  ) {}

  /** Vida: el workflow de despliegue comprueba aquí la revisión servida. */
  @Public()
  @Get("healthz")
  @Header("Cache-Control", "no-store")
  health() {
    return { status: "ok", revision: this.env.RELEASE_SHA };
  }

  /** Preparado: base de datos accesible y migraciones aplicadas. */
  @Public()
  @Get("readyz")
  @Header("Cache-Control", "no-store")
  async ready() {
    try {
      await this.pool.query("select 1");
      return { status: "ready" };
    } catch {
      throw new ServiceUnavailableException("database");
    }
  }

  /** Salud para la monitorización de la plataforma: base accesible y migraciones aplicadas. */
  @Public()
  @Get("health")
  @Header("Cache-Control", "no-store")
  async platformHealth(@Res({ passthrough: true }) reply: FastifyReply) {
    try {
      await this.pool.query("select 1");
      const { rows } = await this.pool.query<{ count: number }>(
        'select count(*)::int as count from app."__drizzle_migrations"',
      );
      if (!rows[0]?.count) throw new Error("sin migraciones");
      return { status: "ok" };
    } catch {
      reply.status(503);
      return { status: "error" };
    }
  }
}
