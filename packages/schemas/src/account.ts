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
