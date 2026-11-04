import { createHmac } from "node:crypto";
import { HttpException, Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { type Database, DB } from "../db/db.module.js";

/**
 * Los endpoints móviles llaman a `auth.api.*` directamente y se saltan el limitador HTTP de Better Auth
 * (docs/plan/05-negocio-api.md; `Problemas-Criticos.md` hallazgo 5). Este limitador aplica los mismos umbrales que
 * `rateLimit.customRules` de `auth.factory.ts`, con ventana fija y contadores atómicos en `app.rate_limits`
 * (la tabla que ya usa Better Auth), por IP real y por cuenta normalizada.
 */
export const MOBILE_AUTH_RULES = {
  "sign-in": { windowSeconds: 60, max: 10 },
  "sign-up": { windowSeconds: 60 * 60, max: 5 },
  "forgot-password": { windowSeconds: 60 * 60, max: 5 },
} as const;

export type MobileAuthAction = keyof typeof MOBILE_AUTH_RULES;

@Injectable()
export class MobileAuthLimiter {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Reloj sustituible en pruebas. */
  now: () => number = Date.now;

  /**
   * Cuenta el intento y rechaza con 429 y `Retry-After` al superar el límite de la IP o de la cuenta.
   * Las dos claves se cuentan siempre, de modo que cambiar de IP no libera la cuenta ni cambiar de cuenta, la IP.
   * Un fallo de la base de datos no concede el intento. No distingue cuentas existentes de inexistentes.
   */
  async hit(action: MobileAuthAction, ip: string | undefined, email: string): Promise<void> {
    if (this.env.TEST_MODE) return;
    const rule = MOBILE_AUTH_RULES[action];
    const windowMs = rule.windowSeconds * 1000;
    const account = createHmac("sha256", `mobile-auth:${this.env.BETTER_AUTH_SECRET}`)
      .update(email.trim().toLowerCase())
      .digest("base64url");
    const keys = [`mobile:${action}:ip:${ip || "unknown"}`, `mobile:${action}:acct:${account}`];
    let retryAfterMs = 0;
    for (const key of keys) {
      const now = this.now();
      const result = await this.db.execute<{ count: number; last_request: string }>(sql`
        INSERT INTO app.rate_limits (id, key, count, last_request)
        VALUES (${crypto.randomUUID()}, ${key}, 1, ${now})
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN ${now} - app.rate_limits.last_request >= ${windowMs} THEN 1 ELSE app.rate_limits.count + 1 END,
          last_request = CASE WHEN ${now} - app.rate_limits.last_request >= ${windowMs} THEN ${now} ELSE app.rate_limits.last_request END
        RETURNING count, last_request`);
      const row = result.rows[0];
      if (row && row.count > rule.max) {
        retryAfterMs = Math.max(retryAfterMs, Number(row.last_request) + windowMs - now);
      }
    }
    if (retryAfterMs > 0) {
      const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));
      throw new HttpException(
        {
          code: "rate_limited",
          message: "Demasiados intentos. Inténtalo de nuevo más tarde.",
          headers: { "Retry-After": String(retryAfter) },
        },
        429,
      );
    }
  }
}
