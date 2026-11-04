import { describe, expect, it, vi } from "vitest";
import { BillingService, statusFromSubscription } from "../src/billing/billing.service.js";
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

describe("sincronización recuperable del estado de facturación", () => {
  it("conserva el marcador si falla el motor y lo borra tras un reintento correcto", async () => {
    const org = { id: "org-1", status: "read_only", calendarStatusPending: true, deletedAt: null };
    const tx = {
      select: () => ({ from: () => ({ where: () => ({ for: async () => [org] }) }) }),
      update: () => ({
        set: (values: { calendarStatusPending: boolean }) => ({
          where: async () => Object.assign(org, values),
        }),
      }),
    };
    const db = { transaction: async (fn: (client: typeof tx) => Promise<void>) => fn(tx) };
    const send = vi.fn().mockRejectedValueOnce(new Error("motor no disponible")).mockResolvedValueOnce({});
    const rpc = { client: () => ({ setOrgStatus: send }) };
    const billing = new BillingService(
      db as never,
      {} as never,
      rpc as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(billing.syncCalendarStatus(org.id)).rejects.toThrow("motor no disponible");
    expect(org.calendarStatusPending).toBe(true);
    await billing.syncCalendarStatus(org.id);
    expect(org.calendarStatusPending).toBe(false);
    expect(send).toHaveBeenLastCalledWith({ orgId: "org-1", status: "read_only" }, expect.anything());
  });
});

describe("estado efectivo proyectado al motor", () => {
  function setup(org: Record<string, unknown>, restricted: boolean, send = vi.fn().mockResolvedValue({})) {
    const row: Record<string, unknown> = {
      id: "org-1",
      ownerUserId: "owner-1",
      calendarStatusPending: true,
      deletedAt: null,
      ...org,
    };
    const select = vi.fn();
    const tx = {
      select: (...args: unknown[]) => {
        select(...args);
        return {
          from: () => ({
            // Con FOR UPDATE devuelve la organización; sin él, la consulta de app.user_restrictions.
            where: () =>
              Object.assign(Promise.resolve(restricted ? [{ userId: "owner-1" }] : []), {
                for: async () => [row],
              }),
          }),
        };
      },
      update: () => ({
        set: (values: Record<string, unknown>) => ({ where: async () => Object.assign(row, values) }),
      }),
    };
    const db = { transaction: async (fn: (client: typeof tx) => Promise<void>) => fn(tx) };
    const rpc = { client: () => ({ setOrgStatus: send }) };
    const billing = new BillingService(
      db as never,
      {} as never,
      rpc as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { billing, row, send };
  }

  it.each(["trialing", "active", "past_due", "read_only"])(
    "proyecta suspended si el propietario está restringido aunque el estado económico sea %s",
    async (status) => {
      const { billing, row, send } = setup({ status }, true);
      await billing.syncCalendarStatus("org-1");
      expect(send).toHaveBeenCalledWith({ orgId: "org-1", status: "suspended" }, expect.anything());
      expect(row.status).toBe(status);
      expect(row.calendarStatusPending).toBe(false);
    },
  );

  it.each(["trialing", "active", "past_due", "read_only"])(
    "al desbloquear vuelve a proyectar el estado económico vigente (%s) sin forzar active",
    async (status) => {
      const { billing, send } = setup({ status }, false);
      await billing.syncCalendarStatus("org-1");
      expect(send).toHaveBeenCalledWith({ orgId: "org-1", status }, expect.anything());
    },
  );

  it("un fallo de la consulta de restricción no envía un estado y conserva el marcador", async () => {
    const send = vi.fn().mockResolvedValue({});
    const { row } = setup({ status: "active" }, false, send);
    let calls = 0;
    const failing = {
      transaction: async (fn: (client: unknown) => Promise<void>) =>
        fn({
          select: () => ({
            from: () => ({
              // La primera consulta bloquea la organización; la segunda (restricciones) falla.
              where: () =>
                calls++ === 0 ? { for: async () => [row] } : Promise.reject(new Error("pg caído")),
            }),
          }),
          update: () => {
            throw new Error("no debe actualizar");
          },
        }),
    };
    const broken = new BillingService(
      failing as never,
      {} as never,
      { client: () => ({ setOrgStatus: send }) } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(broken.syncCalendarStatus("org-1")).rejects.toThrow("pg caído");
    expect(send).not.toHaveBeenCalled();
    expect(row.calendarStatusPending).toBe(true);
  });

  it("setStatus guarda el estado económico y deja el marcador si el motor no responde", async () => {
    const stored = { id: "org-1", ownerUserId: "owner-1", status: "active", pastDueSince: null };
    const updates: Record<string, unknown>[] = [];
    const db = {
      update: () => ({
        set: (values: Record<string, unknown>) => {
          updates.push(values);
          return { where: () => ({ returning: async () => [{ ...stored, ...values }] }) };
        },
      }),
      transaction: async () => {
        throw new Error("motor no disponible");
      },
    };
    const billing = new BillingService(
      db as never,
      {} as never,
      {} as never,
      { now: () => new Date("2026-09-14T12:00:00Z") } as never,
      {} as never,
      { record: vi.fn() } as never,
    );
    const result = await billing.setStatus(stored as never, "past_due");
    expect(result.status).toBe("past_due");
    expect(updates[0]).toMatchObject({ status: "past_due", calendarStatusPending: true });
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
