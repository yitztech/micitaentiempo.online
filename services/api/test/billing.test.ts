import { describe, expect, it } from "vitest";
import { statusFromSubscription } from "../src/billing/billing.service.js";
import { planOfLookupKey, setBillingOverride, stripeConfig } from "../src/billing/stripe.config.js";
import type { Env } from "../src/config/env.js";

describe("máquina de estados de la organización", () => {
  it("traduce el estado de la suscripción de Stripe", () => {
    expect(statusFromSubscription({ status: "active" })).toBe("active");
    expect(statusFromSubscription({ status: "trialing" })).toBe("trialing");
    expect(statusFromSubscription({ status: "past_due" })).toBe("past_due");
    expect(statusFromSubscription({ status: "unpaid" })).toBe("past_due");
    expect(statusFromSubscription({ status: "canceled" })).toBe("read_only");
    expect(statusFromSubscription({ status: "paused" })).toBe("read_only");
    expect(statusFromSubscription({ status: "incomplete_expired" })).toBe("read_only");
  });

  it("identifica el plan por lookup_key", () => {
    expect(planOfLookupKey("personal_monthly_usd")).toBe("personal");
    expect(planOfLookupKey("branches_monthly_usd")).toBe("branches");
    expect(planOfLookupKey("otra")).toBeNull();
  });
});

describe("facturación apagada sin claves", () => {
  const base = { STRIPE_TAX_ENABLED: false } as unknown as Env;
  it("sin las tres claves no se cobra (decisión del 2026-10-06)", () => {
    expect(stripeConfig(base).enabled).toBe(false);
    expect(
      stripeConfig({
        ...base,
        STRIPE_SECRET_KEY: "sk",
        STRIPE_WEBHOOK_SECRET: "wh",
        STRIPE_PUBLISHABLE_KEY: "pk",
      }).enabled,
    ).toBe(true);
  });

  it("el modo de pruebas solo existe con TEST_MODE", () => {
    setBillingOverride("fake");
    expect(stripeConfig({ ...base, STRIPE_FAKE_URL: "http://captura:4010" }).enabled).toBe(false);
    expect(stripeConfig({ ...base, TEST_MODE: "1", STRIPE_FAKE_URL: "http://captura:4010" }).enabled).toBe(
      true,
    );
    setBillingOverride(null);
  });
});
