import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { createChallenge, randomInt, verifySolution } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";

const TTL_MS = 10 * 60 * 1000;

/**
 * Antibots ALTCHA (prueba de trabajo autoalojada, sin terceros ni marcas): registro, códigos de
 * un solo uso, holds y newsletter (docs/plan/05-negocio-api.md §5.8).
 */
@Injectable()
export class AltchaService {
  private readonly signatureSecret: string;
  private readonly keySecret: string;
  private readonly used = new Map<string, number>();

  constructor(@Inject(ENV) private readonly env: Env) {
    this.signatureSecret = env.ALTCHA_HMAC_KEY;
    this.keySecret = createHash("sha256").update(`${env.ALTCHA_HMAC_KEY}:key`).digest("hex");
  }

  /** Con TEST_MODE las pruebas no resuelven retos. */
  get enabled(): boolean {
    return !this.env.TEST_MODE;
  }

  challenge() {
    return createChallenge({
      algorithm: "PBKDF2/SHA-256",
      cost: 5_000,
      counter: randomInt(5_000, 10_000),
      deriveKey,
      expiresAt: new Date(Date.now() + TTL_MS),
      hmacSignatureSecret: this.signatureSecret,
      hmacKeySignatureSecret: this.keySecret,
    });
  }

  /** Verifica la solución (cabecera `x-altcha`, JSON en base64) y evita reutilizarla. */
  async verify(header: string | undefined): Promise<boolean> {
    if (!this.enabled) return true;
    if (!header) return false;
    let payload: { challenge?: unknown; solution?: unknown };
    try {
      payload = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    } catch {
      return false;
    }
    const fingerprint = createHash("sha256").update(header).digest("hex");
    this.prune();
    if (this.used.has(fingerprint)) return false;
    const result = await verifySolution({
      challenge: payload.challenge as never,
      solution: payload.solution as never,
      deriveKey,
      hmacSignatureSecret: this.signatureSecret,
      hmacKeySignatureSecret: this.keySecret,
    }).catch(() => ({ verified: false }));
    if (result.verified) this.used.set(fingerprint, Date.now() + TTL_MS);
    return result.verified;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, until] of this.used) if (until < now) this.used.delete(key);
  }
}
