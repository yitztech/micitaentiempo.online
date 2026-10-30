import { useState } from "react";
import { Link } from "react-router";
import { toneBlock } from "@/components/booking/appointment-card";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { appointments } from "@/lib/data";
import { cn } from "@/lib/utils";

const hours = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
const week = [
  { d: "Lun", n: 19 },
  { d: "Mar", n: 20 },
  { d: "Mié", n: 21 },
  { d: "Jue", n: 22 },
  { d: "Vie", n: 23 },
];
const ROW = 56;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** Resumen de agenda en vista de día o de semana (las citas de demostración son del martes 20). */
export function CalendarOverview({ className }: { className?: string }) {
  const [view, setView] = useState<"dia" | "semana">("dia");
  const cols = view === "dia" ? week.filter((x) => x.n === 20) : week;
  return (
    <Card className={className}>
      <CardHeader className="flex-wrap">
        <CardTitle>Calendario</CardTitle>
        <div className="flex items-center gap-3">
          <fieldset className="m-0 inline-flex min-w-0 rounded-field border-0 bg-primary-50 p-1">
            <legend className="sr-only">Vista del calendario</legend>
            {(["dia", "semana"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "inline-flex h-9 min-w-11 items-center justify-center rounded-[9px] px-3.5 text-sm font-semibold transition-colors",
                  view === v ? "bg-white text-primary shadow-card" : "text-muted hover:text-ink",
                )}
              >
                {v === "dia" ? "Día" : "Semana"}
              </button>
            ))}
          </fieldset>
          <Link to="/panel/calendario" className="text-sm font-semibold text-primary hover:underline">
            Abrir
          </Link>
        </div>
      </CardHeader>
      <CardBody>
        <div
          className="grid border-b border-line/70 pb-2 pl-12 text-center text-xs text-muted"
          style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}
        >
          {cols.map((x) => (
            <div key={x.n}>
              <span>{x.d}</span>
              <span
                className={cn(
                  "mx-auto mt-1 grid size-7 place-items-center rounded-full text-sm font-bold",
                  x.n === 20 ? "bg-primary text-white" : "text-ink",
                )}
              >
                {x.n}
              </span>
            </div>
          ))}
        </div>
        <div className="relative" style={{ height: hours.length * ROW }}>
          {hours.map((h, i) => (
            <div
              key={h}
              className="absolute inset-x-0 flex border-t border-line/60"
              style={{ top: i * ROW, height: ROW }}
            >
              <span className="w-12 -translate-y-2 bg-surface pr-2 text-right text-[11px] tabular-nums text-muted">
                {h}
              </span>
            </div>
          ))}
          <div
            className="absolute inset-y-0 left-12 right-0 grid"
            style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}
          >
            {cols.map((x) => (
              <div key={x.n} className="relative px-0.5">
                {x.n === 20 &&
                  appointments.map((a) => (
                    <div
                      key={a.id}
                      className={cn(
                        "absolute inset-x-0.5 overflow-hidden rounded-lg border-l-4 px-2 py-1 text-xs",
                        toneBlock[a.tone],
                      )}
                      style={{
                        top: ((toMin(a.time) - 480) / 60) * ROW + 2,
                        height: ((toMin(a.end) - toMin(a.time)) / 60) * ROW - 4,
                      }}
                    >
                      <p className="truncate font-semibold">{a.title}</p>
                      <p className="truncate">{a.client}</p>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
