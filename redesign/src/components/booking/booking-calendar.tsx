import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const WEEK = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const monthLabel = (y: number, m: number) => {
  const s = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(new Date(y, m, 1));
  return s.charAt(0).toUpperCase() + s.slice(1).replace(" de ", " ");
};

export type CalendarMonth = { year: number; month: number };

type Cell = { key: string; day: number; out: boolean };

/** Calendario mensual (lunes primero) con selección de día y días marcados. */
export function BookingCalendar({
  value,
  onMonthChange,
  selected,
  onSelect,
  marked = [],
  onNew,
  className,
  compact,
}: {
  value: CalendarMonth;
  onMonthChange?: (v: CalendarMonth) => void;
  selected?: number | null;
  onSelect?: (day: number) => void;
  marked?: number[];
  onNew?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const titleId = useId();
  const { year, month } = value;
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells: Cell[] = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => {
    const d = i - offset + 1;
    if (d < 1) return { key: `p${prevDays + d}`, day: prevDays + d, out: true };
    if (d > days) return { key: `n${d - days}`, day: d - days, out: true };
    return { key: `d${d}`, day: d, out: false };
  });
  const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
  const step = (n: number) => {
    const d = new Date(year, month + n, 1);
    onMonthChange?.({ year: d.getFullYear(), month: d.getMonth() });
  };
  const size = compact ? "size-9" : "size-10 sm:size-11";

  return (
    <section
      aria-labelledby={titleId}
      className={cn("rounded-card border border-line/70 bg-surface p-4 shadow-card sm:p-5", className)}
    >
      <div className="flex items-center justify-between">
        <h3 id={titleId} className="text-base font-bold tracking-tight" aria-live="polite">
          {monthLabel(year, month)}
        </h3>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mes anterior"
            onClick={() => step(-1)}
            className="size-9 sm:size-9"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mes siguiente"
            onClick={() => step(1)}
            className="size-9 sm:size-9"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <table className="mt-3 w-full table-fixed border-collapse text-center">
        <caption className="sr-only">{monthLabel(year, month)}</caption>
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {WEEK.map((w) => (
              <th key={w} scope="col" className="py-1.5 font-semibold">
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]?.key}>
              {row.map((c) => {
                const isSel = !c.out && selected === c.day;
                return (
                  <td key={c.key} className="p-0">
                    <div className="grid place-items-center">
                      {c.out ? (
                        <span aria-hidden className={cn("grid place-items-center text-sm text-muted", size)}>
                          {c.day}
                        </span>
                      ) : (
                        <button
                          type="button"
                          aria-pressed={isSel}
                          aria-label={`${c.day} de ${monthLabel(year, month).split(" ")[0]?.toLowerCase()}${marked.includes(c.day) ? ", con citas" : ""}`}
                          onClick={() => onSelect?.(c.day)}
                          className={cn(
                            "relative grid place-items-center rounded-full text-sm font-medium transition-colors",
                            size,
                            isSel
                              ? "bg-primary font-bold text-white shadow-[0_6px_14px_-6px_rgb(67_56_202/0.8)]"
                              : "hover:bg-primary-50",
                          )}
                        >
                          {c.day}
                          {marked.includes(c.day) && !isSel ? (
                            <span aria-hidden className="absolute bottom-1 size-1 rounded-full bg-primary" />
                          ) : null}
                        </button>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {onNew ? (
        <Button onClick={onNew} className="mt-3 w-full">
          <Plus /> Nueva cita
        </Button>
      ) : null}
    </section>
  );
}
