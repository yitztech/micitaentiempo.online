import { Temporal } from "temporal-polyfill";

/** Instante (ISO UTC) de una hora de pared en una zona (resuelve cambios de horario como el motor). */
export function wallToInstant(date: string, time: string, tz: string): string {
  return Temporal.PlainDateTime.from(`${date}T${time}`)
    .toZonedDateTime(tz, { disambiguation: "compatible" })
    .toInstant()
    .toString();
}

/** Fecha y hora de pared de un instante en una zona. */
export function instantToWall(iso: string, tz: string): { date: string; time: string } {
  const z = Temporal.Instant.from(iso).toZonedDateTimeISO(tz);
  return { date: z.toPlainDate().toString(), time: z.toPlainTime().toString({ smallestUnit: "minute" }) };
}

export function weekdayOf(date: string): number {
  return Temporal.PlainDate.from(date).dayOfWeek; // 1 = lunes
}
