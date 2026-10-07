import { useRoot } from "~/lib/i18n";
import type { ScheduleView } from "~/lib/panel-types";
import { Checkbox } from "./ui";

export interface DayHours {
  open: boolean;
  from: string;
  to: string;
  hasBreak: boolean;
  breakFrom: string;
  breakTo: string;
}

export const defaultWeek = (): DayHours[] =>
  Array.from({ length: 7 }, (_, i) => ({
    open: i < 5,
    from: "09:00",
    to: "18:00",
    hasBreak: i < 5,
    breakFrom: "14:00",
    breakTo: "15:00",
  }));

/** Semana desde los turnos del motor (un turno abierto y un descanso por día en el editor simple). */
export function weekFromShifts(shifts: ScheduleView["shifts"]): DayHours[] {
  const week = Array.from({ length: 7 }, () => ({
    open: false,
    from: "09:00",
    to: "18:00",
    hasBreak: false,
    breakFrom: "14:00",
    breakTo: "15:00",
  }));
  for (const s of shifts) {
    const d = week[s.weekday - 1];
    if (!d) continue;
    if (s.kind === "open") Object.assign(d, { open: true, from: s.range.start, to: s.range.end });
    else Object.assign(d, { hasBreak: true, breakFrom: s.range.start, breakTo: s.range.end });
  }
  return week;
}

export function shiftsFromWeek(week: DayHours[], breakLabel: string): ScheduleView["shifts"] {
  return week.flatMap((d, i) =>
    d.open
      ? [
          { weekday: i + 1, kind: "open" as const, range: { start: d.from, end: d.to } },
          ...(d.hasBreak
            ? [
                {
                  weekday: i + 1,
                  kind: "break" as const,
                  label: breakLabel,
                  range: { start: d.breakFrom, end: d.breakTo },
                },
              ]
            : []),
        ]
      : [],
  );
}

const time = "min-h-11 rounded-[var(--radius-field)] border border-border bg-surface px-2 text-base tabular";

/** Editor de horario semanal: abierto/cerrado, horas y un descanso por día. */
export function HoursEditor({ week, onChange }: { week: DayHours[]; onChange: (w: DayHours[]) => void }) {
  const { t } = useRoot();
  const h = t.panel.welcome.hours;
  const set = (i: number, patch: Partial<DayHours>) =>
    onChange(week.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
      {week.map((d, i) => {
        const day = t.panel.weekdays[i] ?? "";
        return (
          <li key={day} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
            <Checkbox
              label={<span className="capitalize">{day}</span>}
              checked={d.open}
              onChange={(e) => set(i, { open: e.target.checked })}
              className="w-36"
            />
            {d.open ? (
              <>
                <span className="flex items-center gap-2">
                  <input
                    type="time"
                    aria-label={`${day}: ${h.from}`}
                    value={d.from}
                    onChange={(e) => set(i, { from: e.target.value })}
                    className={time}
                  />
                  –
                  <input
                    type="time"
                    aria-label={`${day}: ${h.to}`}
                    value={d.to}
                    onChange={(e) => set(i, { to: e.target.value })}
                    className={time}
                  />
                </span>
                <Checkbox
                  label={h.break}
                  checked={d.hasBreak}
                  onChange={(e) => set(i, { hasBreak: e.target.checked })}
                />
                {d.hasBreak ? (
                  <span className="flex items-center gap-2">
                    <input
                      type="time"
                      aria-label={`${day}: ${h.break} ${h.from}`}
                      value={d.breakFrom}
                      onChange={(e) => set(i, { breakFrom: e.target.value })}
                      className={time}
                    />
                    –
                    <input
                      type="time"
                      aria-label={`${day}: ${h.break} ${h.to}`}
                      value={d.breakTo}
                      onChange={(e) => set(i, { breakTo: e.target.value })}
                      className={time}
                    />
                  </span>
                ) : null}
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
