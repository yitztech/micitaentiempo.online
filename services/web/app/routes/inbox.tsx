import { useRevalidator } from "react-router";
import { Button, Card } from "~/components/ui";
import { apiRequest } from "~/lib/api-client";
import { cx, useRoot } from "~/lib/i18n";
import { type NoticeItem, noticeText } from "~/lib/notices";
import { panelGet } from "~/lib/panel.server";
import { metaFor } from "~/lib/seo";
import { formatDateTime } from "~/lib/time";
import { usePanel } from "./_panel";
import type { Route } from "./+types/inbox";

export async function loader({ request, context }: Route.LoaderArgs) {
  return panelGet<{ unread: number; items: NoticeItem[] }>(
    request,
    context,
    "/api/v1/notifications?limit=100",
  );
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.panel.inbox.seoTitle, indexable: false }));

/** Bandeja de avisos del panel. */
export default function Inbox({ loaderData }: Route.ComponentProps) {
  const { site, t } = useRoot();
  const { me } = usePanel();
  const p = t.panel.inbox;
  const revalidator = useRevalidator();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{p.title}</h1>
        {loaderData.unread ? (
          <Button
            variant="secondary"
            onClick={() =>
              void apiRequest("POST", "/api/v1/notifications/read-all").then(() => revalidator.revalidate())
            }
          >
            {p.markAll}
          </Button>
        ) : null}
      </div>
      {loaderData.items.length === 0 ? (
        <p className="text-muted">{p.empty}</p>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {loaderData.items.map((n) => (
              <li key={n.id} className={cx("p-4", !n.readAt && "bg-primary-soft/50")}>
                {!n.readAt ? <span className="sr-only">{p.new}: </span> : null}
                <p className="text-[15px]">{noticeText(t, site.lang, n, me.timezone)}</p>
                <p className="mt-1 text-sm text-muted">
                  {formatDateTime(n.createdAt, site.lang, me.timezone)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
