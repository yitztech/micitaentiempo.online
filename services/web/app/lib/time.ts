import type { Lang } from "@mcet/i18n";

export const LOCALE: Record<Lang, string> = { es: "es-MX", en: "en-US" };

/** Primera letra en mayúscula (en español no se capitalizan meses ni «de»). */
export function ucfirst(s: string): string {
  return s.charAt(0).toLocaleUpperCase() + s.slice(1);
}

/** Fecha local "AAAA-MM-DD" de un instante en una zona. */
export function localDate(iso: string | Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

export function formatTime(iso: string, lang: Lang, tz: string): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}

export function formatDay(iso: string | Date, lang: Lang, tz: string): string {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

export function formatDateTime(iso: string, lang: Lang, tz: string): string {
  return ucfirst(
    new Intl.DateTimeFormat(LOCALE[lang], {
      timeZone: tz,
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso)),
  );
}

/** Nombre corto de la zona (p. ej. "hora de México"). */
export function tzLabel(tz: string, lang: Lang): string {
  try {
    const parts = new Intl.DateTimeFormat(LOCALE[lang], {
      timeZone: tz,
      timeZoneName: "longGeneric",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

export function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function allTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
}

/** Fechas "AAAA-MM-DD" del mes (año, mes 1-12). */
export function monthDays(year: number, month: number): string[] {
  const n = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from(
    { length: n },
    (_, i) => `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
  );
}

/** 0 = lunes … 6 = domingo. */
export function isoWeekdayIndex(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}
