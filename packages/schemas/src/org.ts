import { z } from "zod";
import { Country } from "./common.ts";

export const Plan = z.enum(["personal", "branches"]);
export type Plan = z.infer<typeof Plan>;

export const OrgStatus = z.enum(["trialing", "active", "past_due", "read_only", "suspended"]);
export type OrgStatus = z.infer<typeof OrgStatus>;

/** Límites por plan (docs/plan/05-negocio-api.md §5.5). */
export const PLAN_LIMITS = {
  personal: { calendars: 1, membersPerCalendar: 10, whatsappPerMonth: 300, priceUsd: 5 },
  branches: { calendars: 10, membersPerCalendar: 10, whatsappPerMonth: 1500, priceUsd: 20 },
} as const satisfies Record<
  Plan,
  { calendars: number; membersPerCalendar: number; whatsappPerMonth: number; priceUsd: number }
>;

export const TRIAL_DAYS = 30;

export const CreateOrg = z
  .object({
    name: z.string().trim().min(1).max(120),
    plan: Plan,
    country: Country.optional(),
  })
  .strict();
export type CreateOrg = z.infer<typeof CreateOrg>;

export const UpdateOrg = CreateOrg.pick({ name: true, country: true }).partial().strict();
export type UpdateOrg = z.infer<typeof UpdateOrg>;
