import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cx, fmt, useRoot } from "~/lib/i18n";
import {
  allTimeZones,
  formatDay,
  formatTime,
  isoWeekdayIndex,
  LOCALE,
  localDate,
  monthDays,
  tzLabel,
  ucfirst,
} from "~/lib/time";

export interface Slot {
  start: string;
  end: string;
}

/**
 * Elegir día y hora (pensado para móvil): calendario del mes con los días sin horarios atenuados y
 * botones de 44 px con la hora en la zona del visitante.
 */
export function SlotPicker({
  slug,
  serviceId,
  tz,
  onTzChange,
  businessTz,
  onPick,
  refreshKey = 0,
}: {
  slug: string;
  serviceId: string;
  tz: string;
  onTzChange: (tz: string) => void;
  businessTz: string;
  onPick: (slot: Slot) => void;
  refreshKey?: number;
}) {
  const { site, t } = useRoot();
  const b = t.booking;
  const today = localDate(new Date(), tz);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [day, setDay] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey fuerza recargar tras un choque
  useEffect(() => {
    let alive = true;
    setSlots(null);
    const [y, m] = month.split("-").map(Number) as [number, number];
    const from = new Date(Math.max(Date.UTC(y, m - 1, 1) - 86_400_000, Date.now()));
    const to = new Date(Date.UTC(y, m, 1) + 86_400_000);
    const qs = new URLSearchParams({ service: serviceId, from: from.toISOString(), to: to.toISOString() });
    fetch(`/api/public/v1/calendars/${slug}/availability?${qs}`)
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((d: { slots: Slot[] }) => alive && setSlots(d.slots))
      .catch(() => alive && setSlots([]));
    return () => {
      alive = false;
    };
  }, [month, slug, serviceId, refreshKey]);

  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots ?? []) {
      const d = localDate(s.start, tz);
      if (!d.startsWith(month)) continue;
      map.set(d, [...(map.get(d) ?? []), s]);
    }
    return map;
  }, [slots, tz, month]);

  useEffect(() => {
    if (slots && (!day || !byDay.has(day))) setDay([...byDay.keys()].sort()[0] ?? null);
  }, [byDay, slots, day]);

  const [y, m] = month.split("-").map(Number) as [number, number];
  const days = monthDays(y, m);
  const mondayFirst = site.lang === "es";
  const lead = mondayFirst
    ? isoWeekdayIndex(days[0] as string)
    : (isoWeekdayIndex(days[0] as string) + 1) % 7;
  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(LOCALE[site.lang], { weekday: "narrow", timeZone: "UTC" }).format(
      new Date(Date.UTC(2026, 0, mondayFirst ? 5 + i : 4 + i)),
    ),
  );
  const monthTitle = ucfirst(
    new Intl.DateTimeFormat(LOCALE[site.lang], {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, 15))),
  );
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    setDay(null);
  };
  const canGoBack = month > today.slice(0, 7);

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section aria-labelledby="titulo-dia">
        <h2 id="titulo-dia" className="text-lg font-semibold">
          {b.date.title}
        </h2>
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => shift(-1)}
            disabled={!canGoBack}
            aria-label={b.date.prev}
            className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2 disabled:opacity-40"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <p className="font-medium" aria-live="polite">
            {monthTitle}
          </p>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label={b.date.next}
            className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
          >
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted" aria-hidden>
          {weekdayNames.map((w, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: posiciones fijas de la semana
            <span key={i}>{w}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: lead }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: huecos fijos
            <span key={`v${i}`} />
          ))}
          {days.map((d) => {
            const has = byDay.has(d);
            const label = `${formatDay(`${d}T12:00:00Z`, site.lang, "UTC")}, ${has ? b.date.available : b.date.unavailable}`;
            return (
              <button
                key={d}
                type="button"
                disabled={!has}
                aria-pressed={day === d}
                aria-label={label}
                onClick={() => setDay(d)}
                className={cx(
                  "flex aspect-square min-h-11 items-center justify-center rounded-full text-[15px] tabular",
                  day === d
                    ? "bg-primary font-semibold text-on-primary"
                    : has
                      ? "font-semibold text-primary hover:bg-primary-soft"
                      : "text-muted/60",
                )}
              >
                {Number(d.slice(8))}
              </button>
            );
          })}
        </div>
        {slots === null ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t.common.ui.loading}
          </p>
        ) : byDay.size === 0 ? (
          <p className="mt-3 text-sm text-muted">{b.date.none}</p>
        ) : null}
      </section>
      <section aria-labelledby="titulo-hora">
        <h2 id="titulo-hora" className="text-lg font-semibold">
          {b.time.title}
        </h2>
        <label className="mt-3 block text-sm text-muted">
          {b.time.changeTz}
          <select
            value={tz}
            onChange={(e) => onTzChange(e.target.value)}
            className="mt-1 block min-h-11 w-full rounded-[var(--radius-field)] border border-border-field bg-surface px-3 text-base text-text"
          >
            {allTimeZones().map((z) => (
              <option key={z} value={z}>
                {z.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-sm text-muted">
          {fmt(b.time.inTz, { tz: tzLabel(tz, site.lang) })}
          {businessTz !== tz ? ` ${fmt(b.time.businessTz, { tz: tzLabel(businessTz, site.lang) })}` : ""}
        </p>
        {day ? <p className="mt-4 font-medium">{formatDay(`${day}T12:00:00Z`, site.lang, "UTC")}</p> : null}
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4" aria-live="polite">
          {(day ? (byDay.get(day) ?? []) : []).map((s) => (
            <li key={s.start}>
              <button
                type="button"
                onClick={() => onPick(s)}
                aria-label={fmt(b.time.slotLabel, {
                  date: formatDay(s.start, site.lang, tz),
                  time: formatTime(s.start, site.lang, tz),
                })}
                className="min-h-11 w-full rounded-[var(--radius-field)] border border-primary/40 text-[15px] font-medium text-primary tabular hover:bg-primary hover:text-on-primary"
              >
                {formatTime(s.start, site.lang, tz)}
              </button>
            </li>
          ))}
        </ul>
        {day && (byDay.get(day) ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-muted">{b.time.none}</p>
        ) : null}
      </section>
    </div>
  );
}
