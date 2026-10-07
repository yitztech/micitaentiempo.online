import { wallToInstant } from "./wall";

export type Repeat = "none" | "daily" | "weekly" | "monthlyDay" | "monthlyNth" | "yearly";
export type Ends = "never" | "until" | "count";

export interface Recurrence {
  repeat: Repeat;
  interval: number;
  weekdays: number[]; // 1 = lunes
  ends: Ends;
  until: string; // AAAA-MM-DD
  count: number;
}

const CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/** RRULE del subconjunto del motor (docs/plan/04-motor-calendario.md §4.5) a partir del editor. */
export function buildRRule(r: Recurrence, startDate: string, tz: string): string {
  if (r.repeat === "none") return "";
  const parts: string[] = [];
  const d = new Date(`${startDate}T12:00:00Z`);
  const weekday = CODES[(d.getUTCDay() + 6) % 7] as string;
  switch (r.repeat) {
    case "daily":
      parts.push("FREQ=DAILY");
      break;
    case "weekly":
      parts.push(
        "FREQ=WEEKLY",
        `BYDAY=${(r.weekdays.length ? r.weekdays : [((d.getUTCDay() + 6) % 7) + 1]).map((w) => CODES[w - 1]).join(",")}`,
      );
      break;
    case "monthlyDay":
      parts.push("FREQ=MONTHLY", `BYMONTHDAY=${d.getUTCDate()}`);
      break;
    case "monthlyNth":
      parts.push("FREQ=MONTHLY", `BYDAY=${Math.ceil(d.getUTCDate() / 7)}${weekday}`);
      break;
    case "yearly":
      parts.push("FREQ=YEARLY");
      break;
  }
  if (r.interval > 1) parts.push(`INTERVAL=${Math.min(99, r.interval)}`);
  if (r.ends === "count") parts.push(`COUNT=${Math.max(1, Math.min(730, r.count))}`);
  if (r.ends === "until" && r.until)
    parts.push(`UNTIL=${wallToInstant(r.until, "23:59", tz).replace(/[-:]/g, "").replace(/\.\d+/, "")}`);
  return parts.join(";");
}

/** Lectura aproximada de una RRULE del motor para editarla. */
export function parseRRule(rule: string | null | undefined): Recurrence {
  const base: Recurrence = { repeat: "none", interval: 1, weekdays: [], ends: "never", until: "", count: 10 };
  if (!rule) return base;
  const kv = Object.fromEntries(
    rule
      .replace(/^RRULE:/, "")
      .split(";")
      .map((p) => p.split("=") as [string, string]),
  );
  base.interval = Number(kv.INTERVAL ?? 1);
  if (kv.COUNT) Object.assign(base, { ends: "count", count: Number(kv.COUNT) });
  if (kv.UNTIL)
    Object.assign(base, {
      ends: "until",
      until: `${kv.UNTIL.slice(0, 4)}-${kv.UNTIL.slice(4, 6)}-${kv.UNTIL.slice(6, 8)}`,
    });
  switch (kv.FREQ) {
    case "DAILY":
      base.repeat = "daily";
      break;
    case "WEEKLY":
      base.repeat = "weekly";
      base.weekdays = (kv.BYDAY ?? "")
        .split(",")
        .map((c) => CODES.indexOf(c) + 1)
        .filter((n) => n > 0);
      break;
    case "MONTHLY":
      base.repeat = kv.BYMONTHDAY ? "monthlyDay" : "monthlyNth";
      break;
    case "YEARLY":
      base.repeat = "yearly";
      break;
  }
  return base;
}
