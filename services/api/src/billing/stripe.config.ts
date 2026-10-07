import Stripe from "stripe";
import type { Env } from "../config/env.js";

export interface StripeConfig {
  enabled: boolean;
  secretKey: string;
  webhookSecret: string;
  publishableKey: string;
  taxEnabled: boolean;
  /** Base de la API (solo pruebas: servidor que imita Stripe). */
  apiBase?: string;
}

/** Claves de prueba sin valor real, solo para el modo «fake» de TEST_MODE. */
export const FAKE_KEYS = {
  secretKey: "sk_test_falsa",
  webhookSecret: "whsec_falsa_de_pruebas",
  publishableKey: "pk_test_falsa",
};

let override: "off" | "fake" | null = null;

/** Solo TEST_MODE: activa la facturación contra el servidor de captura o la apaga (como producción hoy). */
export function setBillingOverride(mode: "off" | "fake" | null): void {
  override = mode;
}

/**
 * La facturación se activa sola cuando existen las tres claves de Stripe (decisión del 2026-10-06:
 * hoy no hay ninguna y no se cobra).
 */
export function stripeConfig(env: Env): StripeConfig {
  if (env.TEST_MODE && override === "fake" && env.STRIPE_FAKE_URL) {
    return { enabled: true, ...FAKE_KEYS, taxEnabled: false, apiBase: env.STRIPE_FAKE_URL };
  }
  if (env.TEST_MODE && override === "off") {
    return { enabled: false, secretKey: "", webhookSecret: "", publishableKey: "", taxEnabled: false };
  }
  const enabled = Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PUBLISHABLE_KEY);
  return {
    enabled,
    secretKey: env.STRIPE_SECRET_KEY ?? "",
    webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? "",
    publishableKey: env.STRIPE_PUBLISHABLE_KEY ?? "",
    taxEnabled: env.STRIPE_TAX_ENABLED,
  };
}

const clients = new Map<string, Stripe>();

/** Cliente de Stripe (versión de API fijada por el SDK). */
export function stripeClient(cfg: StripeConfig): Stripe {
  const key = `${cfg.secretKey}@${cfg.apiBase ?? ""}`;
  let c = clients.get(key);
  if (!c) {
    const base = cfg.apiBase ? new URL(cfg.apiBase) : null;
    c = new Stripe(cfg.secretKey, {
      maxNetworkRetries: 2,
      timeout: 15_000,
      ...(base
        ? {
            host: base.hostname,
            port: Number(base.port || 80),
            protocol: base.protocol.replace(":", "") as "http" | "https",
          }
        : {}),
    });
    clients.set(key, c);
  }
  return c;
}

/** Precios por lookup_key: sin variables con ids de precio (05-negocio-api.md §5.5). */
export const LOOKUP_KEYS = { personal: "personal_monthly_usd", branches: "branches_monthly_usd" } as const;
export type PaidPlan = keyof typeof LOOKUP_KEYS;

export function planOfLookupKey(key: string | null | undefined): PaidPlan | null {
  if (key === LOOKUP_KEYS.personal) return "personal";
  if (key === LOOKUP_KEYS.branches) return "branches";
  return null;
}
