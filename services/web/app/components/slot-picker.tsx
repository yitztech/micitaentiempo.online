import { ChevronLeft, ChevronRight, Loader2, RotateCcw } from "lucide-react";
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
import { Button } from "./ui";

export interface Slot {
  start: string;
  end: string;
}

/**
 * Elegir día y hora (pensado para móvil y escritorio):
 * - Calendario compacto (320-360 px en escritorio, no estirado a media pantalla).
 * - Selección explícita de horario con botón de continuar (B5).
 * - Distingue estado de error con reintento frente a mes vacío (B4).
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
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [localReload, setLocalReload] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: recargar tras cambio de mes, slug, servicio o señal externa/local
  useEffect(() => {
    let alive = true;
    setSlots(null);
    setLoadError(false);
    setSelectedSlot(null);
    const [y, m] = month.split("-").map(Number) as [number, number];
    const from = new Date(Math.max(Date.UTC(y, m - 1, 1) - 86_400_000, Date.now()));
    const to = new Date(Date.UTC(y, m, 1) + 86_400_000);
    const qs = new URLSearchParams({ service: serviceId, from: from.toISOString(), to: to.toISOString() });
    fetch(`/api/public/v1/calendars/${slug}/availability?${qs}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("HTTP error");
        return r.json() as Promise<{ slots: Slot[] }>;
      })
      .then((d) => {
        if (alive) {
          setSlots(d.slots);
          setLoadError(false);
        }
      })
      .catch(() => {
        if (alive) {
          setSlots([]);
          setLoadError(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [month, slug, serviceId, refreshKey, localReload]);

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
    if (slots && (!day || !byDay.has(day))) {
      const firstAvailableDay = [...byDay.keys()].sort()[0] ?? null;
      setDay(firstAvailableDay);
    }
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
    setSelectedSlot(null);
  };
  const canGoBack = month > today.slice(0, 7);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]">
      {/* Columna 1: Calendario mensual compacto */}
      <section aria-labelledby="titulo-dia" className="w-full max-w-[360px]">
        <h2 id="titulo-dia" className="text-lg font-semibold text-text">
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
                onClick={() => {
                  setDay(d);
                  setSelectedSlot(null);
                }}
                className={cx(
                  "flex aspect-square min-h-11 items-center justify-center rounded-full text-[15px] tabular transition-colors",
                  day === d
                    ? "bg-primary font-semibold text-on-primary shadow-sm"
                    : has
                      ? "font-semibold text-primary hover:bg-primary-soft"
                      : "text-muted/50 cursor-not-allowed",
                )}
              >
                {Number(d.slice(8))}
              </button>
            );
          })}
        </div>

        {/* Estados de carga, error y mes sin disponibilidad */}
        {slots === null ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted">
            <Loader2 aria-hidden className="size-4 animate-spin text-primary" />
            {t.common.ui.loading}
          </p>
        ) : loadError ? (
          <div className="mt-4 rounded-[var(--radius-field)] border border-danger/30 bg-danger-soft p-3">
            <p className="text-sm text-danger">{b.date.error}</p>
            <Button
              variant="secondary"
              size="md"
              className="mt-2 text-sm"
              onClick={() => setLocalReload((n) => n + 1)}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              {b.date.retry}
            </Button>
          </div>
        ) : byDay.size === 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-muted">{b.date.none}</p>
            <Button variant="secondary" size="md" className="text-sm" onClick={() => shift(1)}>
              {b.date.nextMonth}
            </Button>
          </div>
        ) : null}
      </section>

      {/* Columna 2: Horarios y confirmación explícita */}
      <section aria-labelledby="titulo-hora" className="w-full">
        <h2 id="titulo-hora" className="text-lg font-semibold text-text">
          {b.time.title}
        </h2>
        <div className="mt-3 max-w-sm">
          <label className="block text-sm text-muted">
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
          <p className="mt-1.5 text-xs text-muted">
            {fmt(b.time.inTz, { tz: tzLabel(tz, site.lang) })}
            {businessTz !== tz ? ` · ${fmt(b.time.businessTz, { tz: tzLabel(businessTz, site.lang) })}` : ""}
          </p>
        </div>

        {day ? (
          <p className="mt-5 font-medium text-text">{formatDay(`${day}T12:00:00Z`, site.lang, "UTC")}</p>
        ) : null}

        {day && (byDay.get(day) ?? []).length > 0 ? (
          <>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4" aria-live="polite">
              {(byDay.get(day) ?? []).map((s) => {
                const isSelected = selectedSlot?.start === s.start;
                return (
                  <li key={s.start}>
                    <button
                      type="button"
                      onClick={() => setSelectedSlot(s)}
                      aria-pressed={isSelected}
                      aria-label={fmt(b.time.slotLabel, {
                        date: formatDay(s.start, site.lang, tz),
                        time: formatTime(s.start, site.lang, tz),
                      })}
                      className={cx(
                        "min-h-11 w-full rounded-[var(--radius-field)] text-[15px] font-medium tabular transition-colors",
                        isSelected
                          ? "bg-primary font-semibold text-on-primary ring-2 ring-primary ring-offset-2 ring-offset-surface"
                          : "border border-primary/40 text-primary hover:bg-primary-soft",
                      )}
                    >
                      {formatTime(s.start, site.lang, tz)}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* B5: Selección explícita con botón para continuar */}
            {selectedSlot ? (
              <div className="mt-6 rounded-[var(--radius-card)] border border-primary/30 bg-primary-soft p-4 max-w-md">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {b.slotStep.selection}
                </p>
                <p className="mt-1 text-base font-medium text-text">
                  {formatDay(selectedSlot.start, site.lang, tz)} ·{" "}
                  {formatTime(selectedSlot.start, site.lang, tz)}
                </p>
                <p className="text-xs text-muted">{tzLabel(tz, site.lang)}</p>
                <Button type="button" size="lg" className="mt-3 w-full" onClick={() => onPick(selectedSlot)}>
                  {b.slotStep.continue}
                </Button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">{b.slotStep.pick}</p>
            )}
          </>
        ) : day && slots !== null && !loadError ? (
          <p className="mt-3 text-sm text-muted">{b.time.none}</p>
        ) : null}
      </section>
    </div>
  );
}
