import { type FormEvent, useState } from "react";
import { useRevalidator } from "react-router";
import { ConnectedCalendars } from "~/components/connected-calendars";
import { CopyField, embedSnippets } from "~/components/copy-field";
import { HoursEditor, shiftsFromWeek, weekFromShifts } from "~/components/hours-editor";
import { Select } from "~/components/select";
import { ServiceForm } from "~/components/service-form";
import { Alert, Button, Card, Checkbox, Field, TextArea } from "~/components/ui";
import { apiRequest, errorText } from "~/lib/api-client";
import { useRoot } from "~/lib/i18n";
import { panelGet } from "~/lib/panel.server";
import type { BoardView, ScheduleView, ServiceView } from "~/lib/panel-types";
import { metaFor } from "~/lib/seo";
import { allTimeZones } from "~/lib/time";
import type { Route } from "./+types/calendar-settings";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const id = params.id ?? "";
  const [board, services, schedule, countries] = await Promise.all([
    panelGet<BoardView>(request, context, `/api/v1/calendars/${id}`),
    panelGet<ServiceView[]>(request, context, `/api/v1/calendars/${id}/services`),
    panelGet<ScheduleView>(request, context, `/api/v1/calendars/${id}/schedule`),
    panelGet<{ countries: Array<{ code: string; name: string }> }>(
      request,
      context,
      "/api/v1/holidays/countries",
    ),
  ]);
  return { board, services, schedule, countries: countries.countries };
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.panel.settings.seoTitle, indexable: false }));

const TYPES = ["public", "bank", "school", "optional", "observance"] as const;

function useSaver() {
  const { t } = useRoot();
  const revalidator = useRevalidator();
  const [state, setState] = useState<{ section: string; ok: boolean; text: string } | null>(null);
  async function save(section: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      setState({ section, ok: true, text: t.panel.settings.saved });
      void revalidator.revalidate();
    } catch (err) {
      setState({ section, ok: false, text: errorText(t.panel.errors, err) });
    }
  }
  const message = (section: string) =>
    state?.section === section ? <Alert tone={state.ok ? "success" : "danger"}>{state.text}</Alert> : null;
  return { save, message };
}

/** Ajustes del tablero (solo propietario): datos, horario, feriados, servicios y compartir. */
export default function CalendarSettings({ loaderData }: Route.ComponentProps) {
  const { site, t } = useRoot();
  const s = t.panel.settings;
  const { board, services, schedule, countries } = loaderData;
  const { save, message } = useSaver();
  const [week, setWeek] = useState(() => weekFromShifts(schedule.shifts));
  const [policy, setPolicy] = useState(
    () =>
      schedule.holidayPolicies[0] ?? { country: board.country ?? "", types: ["public"], substitutes: true },
  );
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const snippets = embedSnippets(site.siteUrl, site.lang, board.slug, board.name);

  function general(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const mode = f.get("embedMode") === "allowlist" ? "allowlist" : "any";
    const origins = String(f.get("origins") ?? "")
      .split(/\s+/)
      .map((o) => o.trim())
      .filter(Boolean);
    void save("general", () =>
      apiRequest("PATCH", `/api/v1/calendars/${board.id}`, {
        name: String(f.get("name")),
        timezone: String(f.get("timezone")),
        capacity: Number(f.get("capacity")),
        address: String(f.get("address") ?? ""),
        cancelMinNoticeMinutes: Math.round(Number(f.get("notice") ?? 0) * 60),
        embedPolicy: { mode, origins: mode === "allowlist" ? origins : [] },
      }),
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {board.name} · {t.panel.nav.settings}
      </h1>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">{s.general}</h2>
        <form method="post" onSubmit={general} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={s.name} name="name" required maxLength={120} defaultValue={board.name} />
          <Select label={s.timezone} name="timezone" defaultValue={board.timezone}>
            {allTimeZones().map((z) => (
              <option key={z} value={z}>
                {z.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
          <Field
            label={s.capacity}
            hint={s.capacityHint}
            name="capacity"
            type="number"
            min={1}
            max={50}
            defaultValue={board.capacity}
          />
          <Field
            label={s.cancelNotice}
            name="notice"
            type="number"
            min={0}
            max={720}
            defaultValue={Math.round(board.cancelMinNoticeMinutes / 60)}
          />
          <Field
            label={s.address}
            name="address"
            maxLength={240}
            defaultValue={board.address ?? ""}
            className="sm:col-span-2"
          />
          <fieldset className="sm:col-span-2">
            <legend className="text-[15px] font-medium">{s.embed}</legend>
            <label className="mt-2 flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="embedMode"
                value="any"
                defaultChecked={board.embedPolicy.mode === "any"}
                className="size-4 accent-[var(--primary)]"
              />
              {s.embedAny}
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="embedMode"
                value="allowlist"
                defaultChecked={board.embedPolicy.mode === "allowlist"}
                className="size-4 accent-[var(--primary)]"
              />
              {s.embedAllowlist}
            </label>
            <TextArea
              label={s.embedOrigins}
              name="origins"
              defaultValue={board.embedPolicy.origins.join("\n")}
              className="mt-2 [&_textarea]:min-h-20"
            />
          </fieldset>
          <div className="space-y-3 sm:col-span-2">
            {message("general")}
            <Button type="submit">{s.save}</Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">{s.hours}</h2>
        <div className="mt-4 space-y-4">
          <HoursEditor week={week} onChange={setWeek} />
          {message("hours")}
          <Button
            onClick={() =>
              void save("hours", () =>
                apiRequest("PUT", `/api/v1/calendars/${board.id}/hours`, {
                  shifts: shiftsFromWeek(week, t.panel.welcome.hours.breakLabel),
                }),
              )
            }
          >
            {s.save}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">{s.holidays}</h2>
        <div className="mt-4 space-y-4">
          <Select
            label={t.panel.welcome.calendar.country}
            value={policy.country}
            onChange={(e) => setPolicy({ ...policy, country: e.target.value })}
          >
            <option value="">—</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
          <fieldset>
            <legend className="text-[15px] font-medium">{t.panel.welcome.holidays.types}</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {TYPES.map((ty) => (
                <Checkbox
                  key={ty}
                  label={t.panel.holidayTypes[ty]}
                  checked={policy.types.includes(ty)}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      types: e.target.checked ? [...policy.types, ty] : policy.types.filter((x) => x !== ty),
                    })
                  }
                />
              ))}
            </div>
          </fieldset>
          {message("holidays")}
          <Button
            onClick={() =>
              void save("holidays", () =>
                apiRequest("PUT", `/api/v1/calendars/${board.id}/holidays`, {
                  policies:
                    policy.country && policy.types.length
                      ? [{ country: policy.country, types: policy.types, substitutes: true }]
                      : [],
                }),
              )
            }
          >
            {s.save}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{s.services}</h2>
          <Button variant="secondary" onClick={() => setEditing("new")}>
            {s.addService}
          </Button>
        </div>
        {editing === "new" ? (
          <div className="mt-4 rounded-[var(--radius-field)] border border-border p-4">
            <ServiceForm calendarId={board.id} onDone={() => setEditing(null)} />
          </div>
        ) : null}
        <ul className="mt-4 divide-y divide-border">
          {services.map((sv) => (
            <li key={sv.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>
                  <span className="font-medium">{sv.name[site.lang] || Object.values(sv.name)[0]}</span>
                  <span className="ml-2 text-sm text-muted">
                    {sv.durationMin} min{sv.active ? "" : ` · ${s.inactive}`}
                  </span>
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setEditing(editing === sv.id ? null : sv.id)}
                    aria-expanded={editing === sv.id}
                  >
                    {s.edit}
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-danger"
                    onClick={() =>
                      void save("services", () =>
                        apiRequest("DELETE", `/api/v1/calendars/${board.id}/services/${sv.id}`),
                      )
                    }
                  >
                    {s.delete}
                  </Button>
                </div>
              </div>
              {editing === sv.id ? (
                <div className="mt-3 rounded-[var(--radius-field)] border border-border p-4">
                  <ServiceForm calendarId={board.id} service={sv} onDone={() => setEditing(null)} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {message("services")}
      </Card>

      <ConnectedCalendars calendarId={board.id} isOwner={board.role === "owner"} tz={board.timezone} />

      <Card className="space-y-4 p-6">
        <h2 className="text-lg font-semibold">{s.share}</h2>
        <CopyField label={s.link} value={snippets.link} />
        <CopyField label={s.embedIframe} value={snippets.iframe} multiline event="embed_copied" />
        <CopyField label={s.embedScript} value={snippets.script} multiline event="embed_copied" />
        <p className="text-sm text-muted">{s.embedHelp}</p>
      </Card>
    </div>
  );
}
