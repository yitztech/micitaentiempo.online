import { pathFor } from "@mcet/i18n";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { apiRequest } from "~/lib/api-client";
import { cx, fmt, useRoot } from "~/lib/i18n";
import { type NoticeItem, noticeText } from "~/lib/notices";
import { browserTz } from "~/lib/time";

/** Campana del panel: contador de no leídos y últimos avisos; se actualiza por SSE. */
export function NotificationBell() {
  const { site, t } = useRoot();
  const p = t.panel;
  const [data, setData] = useState<{ unread: number; items: NoticeItem[] }>({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const load = useCallback(() => {
    void apiRequest<{ unread: number; items: NoticeItem[] }>("GET", "/api/v1/notifications?limit=8")
      .then(setData)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const es = new EventSource("/api/v1/stream");
    es.addEventListener("notification", load);
    return () => es.close();
  }, [load]);

  async function readAll() {
    await apiRequest("POST", "/api/v1/notifications/read-all").catch(() => undefined);
    load();
  }

  const tz = typeof window === "undefined" ? "UTC" : browserTz();
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="campana"
        aria-label={
          data.unread ? `${p.bell.label} · ${fmt(p.inbox.unread, { n: data.unread })}` : p.bell.label
        }
        className="relative flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
      >
        <Bell aria-hidden className="size-5" />
        {data.unread ? (
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-semibold text-white tabular"
          >
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id="campana"
          className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-soft)]"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <p className="font-semibold">{p.inbox.title}</p>
            {data.unread ? (
              <button
                type="button"
                onClick={() => void readAll()}
                className="min-h-11 text-sm text-primary underline underline-offset-2"
              >
                {p.inbox.markAll}
              </button>
            ) : null}
          </div>
          {data.items.length === 0 ? (
            <p className="p-4 text-[15px] text-muted">{p.bell.empty}</p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-auto">
              {data.items.map((n) => (
                <li key={n.id} className={cx("px-4 py-3 text-[15px]", !n.readAt && "bg-primary-soft/60")}>
                  {!n.readAt ? <span className="sr-only">{p.inbox.new}: </span> : null}
                  {noticeText(t, site.lang, n, tz)}
                </li>
              ))}
            </ul>
          )}
          <Link
            to={pathFor("inbox", site.lang)}
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-3 text-center text-sm text-primary"
          >
            {p.inbox.seeAll}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
