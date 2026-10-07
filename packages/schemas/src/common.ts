import { z } from "zod";

export const Lang = z.enum(["es", "en"]);

/** Zona horaria IANA válida para Intl (la valida también el motor con time.LoadLocation). */
export const TimeZone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "zona horaria no válida");

/** ISO 3166-1 alfa-2. */
export const Country = z.string().regex(/^[A-Z]{2}$/, "código de país ISO de 2 letras");
