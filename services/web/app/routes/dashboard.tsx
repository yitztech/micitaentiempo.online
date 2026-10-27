import { pathFor } from "@mcet/i18n";
import { Building2, CalendarDays, Clock3 } from "lucide-react";
import { redirect } from "react-router";
import { CopyField, embedSnippets } from "~/components/copy-field";
import { Alert, Card, LinkButton } from "~/components/ui";
import { siteContext } from "~/lib/context";
import { fmt, useRoot } from "~/lib/i18n";
import { panelGet, panelGetOptional } from "~/lib/panel.server";
import type { BoardView, EventView, Org } from "~/lib/panel-types";
import { metaFor } from "~/lib/seo";
import { formatDateTime } from "~/lib/time";
import { usePanel } from "./_panel";
import type { Route } from "./+types/dashboard";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { lang } = context.get(siteContext);
  const [calendars, org] = await Promise.all([
    panelGet<BoardView[]>(request, context, "/api/v1/calendars"),
    panelGetOptional<Org>(request, context, "/api/v1/org"),
  ]);
  if (calendars.length === 0) {
    if (org) throw redirect(pathFor("welcome", lang));
    throw redirect(pathFor("myAppointments", lang));
  }
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const lists = await Promise.all(
    calendars
      .slice(0, 10)
      .map((c) =>
        panelGet<EventView[]>(
          request,
          context,
          `/api/v1/calendars/${c.id}/events?from=${from}&to=${to}`,
        ).catch(() => []),
      ),
  );
  const upcoming = lists
    .flat()
    .filter((e) => e.kind === "appointment" && e.status === "confirmed")
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 12);
  return { upcoming };
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.panel.home.seoTitle, indexable: false }));

export default function PanelHome({ loaderData }: Route.ComponentProps) {
  const { site, t, features } = useRoot();
  const p = t.panel.home;
  const { me, calendars, org } = usePanel();
  const byId = new Map(calendars.map((c) => [c.id, c]));
  const days = org?.trialEndsAt
    ? Math.max(0, Math.ceil((Date.parse(org.trialEndsAt) - Date.now()) / 86_400_000))
    : null;
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">
        {fmt(p.greeting, { name: me.name || me.email })}
      </h1>
      {org?.status === "read_only" ? <Alert tone="warning">{p.readOnly}</Alert> : null}
      {org?.status === "trialing" ? (
        <Alert tone="info">{features.stripe && days !== null ? fmt(p.trialDays, { days }) : p.trial}</Alert>
      ) : null}

      {org ? (
        <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between bg-primary-soft/30 border-primary/20">
          <div className="flex items-center gap-3">
            <Building2 aria-hidden className="size-6 text-primary shrink-0" />
            <div>
              <p className="font-semibold text-text">{t.panel.businessProfile.title}</p>
              <p className="text-xs text-muted">{t.panel.businessProfile.lead}</p>
            </div>
          </div>
          <LinkButton
            to={pathFor("businessProfileSettings", site.lang)}
            variant="secondary"
            className="text-sm shrink-0"
          >
            {t.panel.businessProfile.navLink}
          </LinkButton>
        </Card>
      ) : null}

      <section aria-labelledby="proximas">
        <h2 id="proximas" className="text-xl font-semibold">
          {p.upcoming}
        </h2>
        {loaderData.upcoming.length === 0 ? (
          <p className="mt-3 text-muted">{p.noUpcoming}</p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
            {loaderData.upcoming.map((e) => {
              const c = byId.get(e.calendarId);
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <div>
                    <p className="font-medium">{e.attendee?.name ?? e.title ?? ""}</p>
                    <p className="flex items-center gap-1.5 text-sm text-muted">
                      <Clock3 aria-hidden className="size-4" />
                      {formatDateTime(e.start, site.lang, c?.timezone ?? me.timezone)}
                    </p>
                  </div>
                  <span className="text-sm text-muted">{c?.name}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="tableros">
        <h2 id="tableros" className="text-xl font-semibold">
          {p.boards}
        </h2>
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {calendars.map((c) => (
            <li key={c.id}>
              <Card className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{c.name}</p>
                    <p className="text-sm text-muted">{p.roles[c.role]}</p>
                  </div>
                  <LinkButton to={pathFor("calendar", site.lang, { id: c.id })} variant="secondary">
                    <CalendarDays aria-hidden className="size-4" />
                    {p.openCalendar}
                  </LinkButton>
                </div>
                <CopyField
                  label={p.bookingLink}
                  value={embedSnippets(site.siteUrl, site.lang, c.slug, c.name).link}
                />
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
