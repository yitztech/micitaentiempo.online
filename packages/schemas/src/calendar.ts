import { z } from "zod";
import { Country, TimeZone } from "./common.ts";

const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "hora HH:MM");
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha AAAA-MM-DD");
const Subdivision = z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,4}$/, "región ISO 3166-2");
/** Intervalos de horario permitidos (minutos). */
export const SLOT_STEPS = [5, 10, 15, 20, 30, 45, 60, 90, 120];

const Slug = z
  .string()
  .regex(/^[a-z0-9](-?[a-z0-9])*$/)
  .min(3)
  .max(60);

export const TimeRange = z.object({ start: Hhmm, end: Hhmm }).strict();

export const CreateCalendar = z
  .object({
    name: z.string().trim().min(1).max(120),
    timezone: TimeZone,
    slug: Slug.optional(),
    capacity: z.number().int().min(1).max(50).default(1),
    country: Country.optional(),
    subdivision: Subdivision.optional(),
    address: z.string().trim().max(240).optional(),
  })
  .strict();
export type CreateCalendar = z.infer<typeof CreateCalendar>;

export const EmbedPolicy = z
  .object({
    mode: z.enum(["any", "allowlist"]),
    origins: z.array(z.url()).max(20).default([]),
  })
  .strict();

export const UpdateCalendar = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: Slug,
    timezone: TimeZone,
    capacity: z.number().int().min(1).max(50),
    country: Country.or(z.literal("")),
    subdivision: Subdivision.or(z.literal("")),
    address: z.string().trim().max(240),
    embedPolicy: EmbedPolicy,
    cancelMinNoticeMinutes: z.number().int().min(0).max(43_200),
  })
  .partial()
  .strict();
export type UpdateCalendar = z.infer<typeof UpdateCalendar>;

export const Shift = z
  .object({
    weekday: z.number().int().min(1).max(7),
    kind: z.enum(["open", "break"]),
    range: TimeRange,
    label: z.string().trim().max(60).optional(),
  })
  .strict();

export const WeeklyHours = z.object({ shifts: z.array(Shift).max(70) }).strict();
export type WeeklyHours = z.infer<typeof WeeklyHours>;

export const DateOverride = z
  .object({
    kind: z.enum(["closed", "custom", "open_on_holiday"]),
    intervals: z.array(TimeRange).max(10).default([]),
    note: z.string().trim().max(200).optional(),
  })
  .strict();
export type DateOverride = z.infer<typeof DateOverride>;

export const HolidayType = z.enum(["public", "bank", "school", "optional", "observance"]);

export const HolidayPolicies = z
  .object({
    policies: z
      .array(
        z
          .object({
            country: Country,
            subdivision: Subdivision.optional(),
            types: z.array(HolidayType).min(1).default(["public"]),
            substitutes: z.boolean().default(true),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();
export type HolidayPolicies = z.infer<typeof HolidayPolicies>;

export const CustomHoliday = z
  .object({
    name: z.string().trim().min(1).max(120),
    date: IsoDate.optional(),
    monthDay: z
      .string()
      .regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
      .optional(),
  })
  .strict()
  .refine((v) => Boolean(v.date) !== Boolean(v.monthDay), "indica una fecha o un día de cada año");
export type CustomHoliday = z.infer<typeof CustomHoliday>;

export const HolidayRange = z.object({ from: IsoDate, to: IsoDate }).strict();

export const Service = z
  .object({
    name: z.object({ es: z.string().trim().max(120), en: z.string().trim().max(120) }).partial(),
    description: z
      .object({ es: z.string().trim().max(1000), en: z.string().trim().max(1000) })
      .partial()
      .default({}),
    durationMin: z.number().int().min(5).max(720),
    bufferBeforeMin: z.number().int().min(0).max(240).default(0),
    bufferAfterMin: z.number().int().min(0).max(240).default(0),
    minNoticeMin: z.number().int().min(0).max(43_200).default(60),
    maxAdvanceDays: z.number().int().min(1).max(365).default(60),
    slotStepMin: z
      .number()
      .int()
      .refine((n) => SLOT_STEPS.includes(n), "intervalo no permitido")
      .default(30),
    dailyLimit: z.number().int().min(0).max(500).default(0),
    color: z
      .string()
      .regex(/^[a-z]+$/)
      .max(20)
      .default("laguna"),
    active: z.boolean().default(true),
  })
  .strict()
  .refine((s) => Boolean(s.name.es || s.name.en), "el servicio necesita nombre en español o en inglés");
export type Service = z.infer<typeof Service>;

export const ServiceOrder = z.object({ ids: z.array(z.string().min(1)).max(100) }).strict();

export const AvailabilityQuery = z
  .object({
    service: z.string().min(1),
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
  })
  .strict();
export type AvailabilityQuery = z.infer<typeof AvailabilityQuery>;

export const Invitation = z
  .object({
    email: z.string().trim().min(3).max(254),
    role: z.enum(["editor", "observer"]),
  })
  .strict();
export type Invitation = z.infer<typeof Invitation>;
