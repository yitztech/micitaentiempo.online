import { z } from "zod";
import { TimeZone } from "./common.ts";

const Instant = z.iso.datetime({ offset: true });
const Uuid = z.uuid();

/** Datos del asistente que se guardan con la cita. */
export const Attendee = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().max(254).optional(),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{6,14}$/, "teléfono E.164")
      .optional(),
    timezone: TimeZone.optional(),
  })
  .strict();
export type Attendee = z.infer<typeof Attendee>;

export const EventsQuery = z
  .object({
    from: Instant,
    to: Instant,
    includeCancelled: z.stringbool().default(false),
  })
  .strict();
export type EventsQuery = z.infer<typeof EventsQuery>;

/** Alta de cita o bloqueo desde el panel; con `rrule` crea una serie (solo propietario y editores). */
export const CreateEvent = z
  .object({
    kind: z.enum(["appointment", "block"]).default("appointment"),
    start: Instant,
    end: Instant.optional(),
    serviceId: Uuid.optional(),
    title: z.string().trim().max(200).optional(),
    customerUserId: z.string().min(1).max(64).optional(),
    attendee: Attendee.optional(),
    internalNotes: z.string().max(2000).optional(),
    rrule: z.string().max(300).optional(),
    onConflict: z.enum(["abort", "skip"]).default("abort"),
    cancelOverlapping: z.boolean().default(false),
  })
  .strict()
  .refine((v) => v.kind === "block" || v.serviceId || v.end, {
    message: "una cita necesita servicio o fin",
    path: ["end"],
  })
  .refine((v) => v.kind === "appointment" || v.end, { message: "un bloqueo necesita fin", path: ["end"] });
export type CreateEvent = z.infer<typeof CreateEvent>;

export const EventScope = z.enum(["this", "following", "all"]);

export const UpdateEvent = z
  .object({
    expectedVersion: z.number().int().min(0).default(0),
    scope: EventScope.default("this"),
    start: Instant.optional(),
    end: Instant.optional(),
    title: z.string().trim().max(200).optional(),
    internalNotes: z.string().max(2000).optional(),
    attendee: Attendee.optional(),
    rrule: z.string().max(300).optional(),
  })
  .strict();
export type UpdateEvent = z.infer<typeof UpdateEvent>;

export const CancelEvent = z
  .object({
    scope: EventScope.default("this"),
    reason: z.string().trim().max(500).default(""),
    expectedVersion: z.number().int().min(0).default(0),
  })
  .strict();
export type CancelEvent = z.infer<typeof CancelEvent>;

export const Attendance = z.object({ attendance: z.enum(["attended", "no_show", ""]) }).strict();
export type Attendance = z.infer<typeof Attendance>;

export const StatsQuery = z.object({ calendar: Uuid, from: Instant, to: Instant }).strict();
export type StatsQuery = z.infer<typeof StatsQuery>;

/** Reserva desde el embed o la página pública: aparta el horario antes de verificar el correo. */
export const PublicHold = z
  .object({
    serviceId: Uuid,
    start: Instant,
    attendee: Attendee.extend({ email: z.string().trim().min(3).max(254) }),
    notes: z.string().max(1000).optional(),
    channel: z.enum(["embed", "public"]).default("public"),
  })
  .strict();
export type PublicHold = z.infer<typeof PublicHold>;

/** Cabecera Idempotency-Key de las reservas: un UUID o un texto aleatorio de 16 a 128 caracteres. */
export const IdempotencyKey = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const HoldToken = z
  .string()
  .min(32)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const ConfirmHold = z
  .object({
    holdToken: HoldToken,
    name: z.string().trim().min(1).max(120).optional(),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{6,14}$/)
      .optional(),
    timezone: TimeZone.optional(),
    notes: z.string().max(1000).optional(),
  })
  .strict();
export type ConfirmHold = z.infer<typeof ConfirmHold>;

export const ReleaseHold = z.object({ holdToken: HoldToken }).strict();

export const OtpSend = z.object({ email: z.string().trim().min(3).max(254) }).strict();
export type OtpSend = z.infer<typeof OtpSend>;

export const OtpVerify = z
  .object({
    email: z.string().trim().min(3).max(254),
    code: z.string().regex(/^\d{6}$/),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
export type OtpVerify = z.infer<typeof OtpVerify>;

export const MyBookingsQuery = z.object({ includePast: z.stringbool().default(false) }).strict();

export const Reschedule = z
  .object({ start: Instant, expectedVersion: z.number().int().min(0).default(0) })
  .strict();
export type Reschedule = z.infer<typeof Reschedule>;

export const CancelBooking = z.object({ reason: z.string().trim().max(500).default("") }).strict();
