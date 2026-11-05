import { createHash } from "node:crypto";
import type { AdminDatabase } from "../db/admin-db.js";

const WINDOW_MS = 15 * 60 * 1000;
// El límite de la cuenta es más alto: quien falla desde otra IP no debe poder dejar fuera al administrador tan rápido.
const MAX_FAILURES_PER_IP = 5;
const MAX_FAILURES_PER_ACCOUNT = 20;

interface LoginKey {
  key: string;
  max: number;
}

/** Cuenta solo los fallos, por IP y por cuenta, en SQLite para que un reinicio no los borre. */
export class LoginLimiter {
  constructor(
    private adminDb: AdminDatabase,
    private now: () => number = () => Date.now(),
  ) {}

  /** Segundos que faltan para poder intentarlo, o 0 si no hay límite activo. */
  retryAfter(ip: string, username: string): number {
    const now = this.now();
    const waits = this.keys(ip, username).map(({ key, max }) => {
      const entry = this.adminDb.getLoginFailures(key);
      if (!entry || entry.failures < max) return 0;
      return Math.max(0, Math.ceil((entry.window_start + WINDOW_MS - now) / 1000));
    });
    return Math.max(...waits);
  }

  /** Registra un fallo; devuelve true si este intento alcanzó un límite. */
  recordFailure(ip: string, username: string): boolean {
    const now = this.now();
    this.adminDb.deleteExpiredLoginFailures(now - WINDOW_MS);
    return this.keys(ip, username)
      .map(({ key, max }) => this.adminDb.addLoginFailure(key, now) === max)
      .some(Boolean);
  }

  clear(ip: string, username: string): void {
    for (const { key } of this.keys(ip, username)) this.adminDb.deleteLoginFailures(key);
  }

  private keys(ip: string, username: string): LoginKey[] {
    const account = username.trim().toLowerCase();
    return [
      { key: hash(`ip:${ip}`), max: MAX_FAILURES_PER_IP },
      { key: hash(`account:${account}`), max: MAX_FAILURES_PER_ACCOUNT },
    ];
  }
}

/** Lo que se escribe mal en «usuario» a veces es una contraseña: no se guarda en claro. */
function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
