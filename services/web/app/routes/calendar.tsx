import { pathFor } from "@mcet/i18n";
import { CalendarPlus, Lock, Settings, Users } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { type EditorTarget, EventEditor } from "~/components/event-editor";
import { Alert, Button, buttonClass } from "~/components/ui";
import { fmt, useRoot } from "~/lib/i18n";
import { panelGet } from "~/lib/panel.server";
import { type BoardView, canWrite, type ScheduleView, type ServiceView } from "~/lib/panel-types";
import { metaFor } from "~/lib/seo";
import { browserTz, tzLabel } from "~/lib/time";
import type { Route } from "./+types/calendar";

const BoardCalendar = lazy(() => import("~/components/board-calendar"));

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const id = params.id ?? "";
  const [board, services, schedule] = await Promise.all([
    panelGet<BoardView>(request, context, `/api/v1/calendars/${id}`),
    panelGet<ServiceView[]>(request, context, `/api/v1/calendars/${id}/services`),
    panelGet<ScheduleView>(request, context, `/api/v1/calendars/${id}/schedule`),
  ]);
  return { board, services, schedule };
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({
    title: `${args.loaderData?.board.name ?? ""} · ${t.panel.calendar.seoTitle}`,
    indexable: false,
  }));

export default function CalendarPage({ loaderData }: Route.ComponentProps) {
  const { site, t } = useRoot();
  const c = t.panel.calendar;
  const { board, services, schedule } = loaderData;
  const writable = canWrite(board.role) && board.orgStatus !== "read_only";
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [changed, setChanged] = useState(false);
  const [myTz, setMyTz] = useState(board.timezone);
  const names = useMemo(
    () => new Map(services.map((s) => [s.id, s.name[site.lang] || Object.values(s.name)[0] || ""])),
    [services, site.lang],
  );

  useEffect(() => {
    setMounted(true);
    setMyTz(browserTz());
    // Tiempo real: el servidor solo avisa; los datos se vuelven a pedir.
    const es = new EventSource("/api/v1/stream");
    es.addEventListener("change", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { calendarId: string; mine: boolean };
      if (d.calendarId !== board.id) return;
      setRefresh((n) => n + 1);
      if (!d.mine) {
        setChanged(true);
        setTimeout(() => setChanged(false), 4_000);
      }
    });
    return () => es.close();
  }, [board.id]);

  const open = (kind: "appointment" | "block", start?: string, end?: string) =>
    setTarget({ mode: "create", kind, start, end });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{board.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {fmt(c.boardTz, { tz: tzLabel(board.timezone, site.lang) })}
            {myTz !== board.timezone ? ` · ${fmt(c.yourTz, { tz: tzLabel(myTz, site.lang) })}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {writable ? (
            <>
              <Button onClick={() => open("appointment")}>
                <CalendarPlus aria-hidden className="size-4" />
                {c.newAppointment}
              </Button>
              <Button variant="secondary" onClick={() => open("block")}>
                <Lock aria-hidden className="size-4" />
                {c.newBlock}
              </Button>
            </>
          ) : null}
          {board.role === "owner" ? (
            <>
              <Link
                to={pathFor("calendarSettings", site.lang, { id: board.id })}
                className={buttonClass("ghost")}
              >
                <Settings aria-hidden className="size-4" />
                {t.panel.nav.settings}
              </Link>
              <Link
                to={pathFor("calendarTeam", site.lang, { id: board.id })}
                className={buttonClass("ghost")}
              >
                <Users aria-hidden className="size-4" />
                {t.panel.nav.team}
              </Link>
            </>
          ) : null}
        </div>
      </div>
      {!writable ? <Alert className="mt-4">{c.readOnly}</Alert> : null}
      <div aria-live="polite">{changed ? <Alert className="mt-4">{c.changedByOther}</Alert> : null}</div>
      <div className="mt-6 rounded-[var(--radius-card)] border border-border bg-surface p-2 sm:p-4">
        {mounted ? (
          <Suspense fallback={<p className="p-6 text-muted">{t.common.ui.loading}</p>}>
            <BoardCalendar
              lang={site.lang}
              calendarId={board.id}
              tz={board.timezone}
              schedule={schedule}
              serviceNames={names}
              selectable={writable}
              refreshKey={refresh}
              legend={c.legend}
              onSelect={(s, e) => open("appointment", s, e)}
              onEventClick={async (ev) => {
                const full = await fetch(`/api/v1/calendars/${board.id}/events/${ev.id}`).then((r) =>
                  r.ok ? r.json() : ev,
                );
                setTarget({ mode: "edit", kind: ev.kind, event: full });
              }}
            />
          </Suspense>
        ) : (
          <p className="p-6 text-muted">{t.common.ui.loading}</p>
        )}
      </div>
      <EventEditor
        calendarId={board.id}
        tz={board.timezone}
        services={services}
        canWrite={writable}
        target={target}
        onClose={() => setTarget(null)}
        onSaved={() => {
          setTarget(null);
          setRefresh((n) => n + 1);
        }}
      />
    </div>
  );
}
