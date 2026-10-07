import { z } from "zod";
import { Country, Lang, TimeZone } from "./common.ts";

/** Nombre completo en un solo campo (culturalmente flexible: dos apellidos, nombre único…). */
export const FullName = z.string().trim().min(1).max(120);

export const UpdateMe = z
  .object({
    name: FullName,
    locale: Lang,
    timezone: TimeZone,
    timeFormat: z.enum(["12h", "24h"]),
    weekStart: z.union([z.literal(1), z.literal(7)]),
    country: Country.nullable(),
  })
  .partial()
  .strict();
export type UpdateMe = z.infer<typeof UpdateMe>;

/** Formulario de contacto de las páginas públicas. */
export const ContactMessage = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().min(3).max(254),
    message: z.string().trim().min(10).max(4000),
    newsletter: z.boolean().default(false),
  })
  .strict();
export type ContactMessage = z.infer<typeof ContactMessage>;

export const NewsletterSignup = z
  .object({ email: z.string().trim().min(3).max(254), name: z.string().trim().max(120).optional() })
  .strict();
export type NewsletterSignup = z.infer<typeof NewsletterSignup>;
