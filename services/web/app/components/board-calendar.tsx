import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import listPlugin from "@fullcalendar/react/list";
import esLocale from "@fullcalendar/react/locales/es";
import classicTheme from "@fullcalendar/react/themes/classic";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import "./board-calendar.css";
import type { Lang } from "@mcet/i18n";
import { useEffect, useState } from "react";
import { useT } from "~/lib/i18n";
import type { EventView, ScheduleView } from "~/lib/panel-types";

interface Props {
  lang: Lang;
  calendarId: string;
  tz: string;
  schedule: ScheduleView;
  serviceNames: Map<string, string>;
  selectable: boolean;
  onSelect: (start: string, end: string) => void;
  onEventClick: (ev: EventView) => void;
  refreshKey: number;
  legend: { booking: string; appointment: string; block: string; holiday: string };
}

/** Horas de apertura para FullCalendar: turnos abiertos menos descansos, por día (0 = domingo). */
function businessHours(schedule: ScheduleView) {
  const out: Array<{ daysOfWeek: number[]; startTime: string; endTime: string }> = [];
  for (let wd = 1; wd <= 7; wd++) {
    const opens = schedule.shifts
      .filter((s) => s.weekday === wd && s.kind === "open")
      .map((s) => [s.range.start, s.range.end] as [string, string]);
    const breaks = schedule.shifts
      .filter((s) => s.weekday === wd && s.kind === "break")
      .map((s) => [s.range.start, s.range.end] as [string, string]);
    for (const [a, b] of opens) {
      let pieces: Array<[string, string]> = [[a, b]];
      for (const [x, y] of breaks)
        pieces = pieces.flatMap(([p, q]) =>
          y <= p || x >= q
            ? [[p, q]]
            : (
                [
                  [p, x],
                  [y, q],
                ] as Array<[string, string]>
              ).filter(([m, n]) => m < n),
        );
      for (const [p, q] of pieces)
        out.push({ daysOfWeek: [wd % 7], startTime: p, endTime: q === "24:00" ? "24:00" : q });
    }
  }
  return out;
}

function viewFor(width: number) {
  if (width < 640) return { initial: "listWeek", right: "listWeek,timeGridDay" };
  if (width < 1024) return { initial: "timeGridThreeDay", right: "timeGridThreeDay,timeGridWeek,listWeek" };
  return { initial: "timeGridWeek", right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek" };
}

/** Calendario del tablero (solo en el cliente): citas, bloqueos, feriados de fondo y horario. */
export function BoardCalendar(props: Props) {
  const t = useT().panel.calendar;
  const {
    lang,
    calendarId,
    tz,
    schedule,
    serviceNames,
    selectable,
    onSelect,
    onEventClick,
    refreshKey,
    legend,
  } = props;
  const [views] = useState(() => viewFor(window.innerWidth));
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [byId, setById] = useState(new Map<string, EventView>());

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey fuerza recargar tras guardar o un aviso SSE
  useEffect(() => {
    if (!range) return;
    let alive = true;
    const q = `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
    const days = (iso: string) => iso.slice(0, 10);
    void Promise.all([
      fetch(`/api/v1/calendars/${calendarId}/events?${q}`, { headers: { accept: "application/json" } }).then(
        (r) => (r.ok ? r.json() : []),
      ),
      fetch(`/api/v1/calendars/${calendarId}/holidays?from=${days(range.from)}&to=${days(range.to)}`).then(
        (r) => (r.ok ? r.json() : []),
      ),
    ]).then(([evs, hols]: [EventView[], Array<{ date: string; name: string; open: boolean }>]) => {
      if (!alive) return;
      setById(new Map(evs.map((e) => [e.id, e])));
      setEvents([
        ...evs.map((e) => {
          const type = e.kind === "block" ? "block" : e.customerUserId ? "booking" : "appointment";
          const who = e.attendee?.name ?? e.title ?? "";
          const svc = e.serviceId ? serviceNames.get(e.serviceId) : undefined;
          return {
            id: e.id,
            start: e.start,
            end: e.end,
            title: [who || (e.kind === "block" ? legend.block : ""), svc].filter(Boolean).join(" · "),
            classNames: [`ev-${type}`, e.status === "held" ? "ev-held" : ""],
            extendedProps: { type },
          };
        }),
        ...hols
          .filter((h) => !h.open)
          .map((h) => ({
            start: h.date,
            allDay: true,
            display: "background",
            title: h.name,
            classNames: ["ev-holiday"],
          })),
      ]);
    });
    return () => {
      alive = false;
    };
  }, [range, calendarId, refreshKey, serviceNames, legend.block]);

  return (
    <div className="board-calendar">
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        {(["booking", "appointment", "block", "holiday"] as const).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span aria-hidden className={`legend-dot ev-${k}`} />
            {legend[k]}
          </li>
        ))}
      </ul>
      <FullCalendar
        plugins={[classicTheme, dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        locale={lang === "es" ? esLocale : "en"}
        timeZone={tz}
        initialView={views.initial}
        views={{ timeGridThreeDay: { type: "timeGrid", duration: { days: 3 } } }}
        // La vista personalizada necesita texto y ayuda propios en FullCalendar 7. El locale
        // español falla si recibe una unidad sin etiqueta al generar el botón «Hoy».
        buttons={{ timeGridThreeDay: { text: t.threeDays, hint: t.threeDaysHint } }}
        todayHint={t.todayHint}
        headerToolbar={{ left: "prev,next today", center: "title", right: views.right }}
        height="auto"
        nowIndicator
        allDaySlot
        slotMinTime="06:00:00"
        slotMaxTime="22:00:00"
        businessHours={businessHours(schedule)}
        selectable={selectable}
        selectMirror
        events={events}
        datesSet={(info: { start: Date; end: Date }) =>
          setRange({ from: info.start.toISOString(), to: info.end.toISOString() })
        }
        select={(info: { start: Date; end: Date }) =>
          onSelect(info.start.toISOString(), info.end.toISOString())
        }
        eventClick={(info: { event: { id: string } }) => {
          const ev = byId.get(info.event.id);
          if (ev) onEventClick(ev);
        }}
      />
    </div>
  );
}

export default BoardCalendar;
