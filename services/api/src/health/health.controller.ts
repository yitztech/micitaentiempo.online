import { Controller, Get, Header, Inject, ServiceUnavailableException } from "@nestjs/common";
import type pg from "pg";
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
  @Get("healthz")
  @Header("Cache-Control", "no-store")
  health() {
    return { status: "ok", revision: this.env.RELEASE_SHA };
  }

  /** Preparado: base de datos accesible y migraciones aplicadas. */
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
}
