import { pathFor } from "@mcet/i18n";
import { type FormEvent, useEffect, useState } from "react";
import { CopyField, embedSnippets } from "~/components/copy-field";
import { defaultWeek, HoursEditor, shiftsFromWeek } from "~/components/hours-editor";
import { Select } from "~/components/select";
import { Alert, Button, Card, Checkbox, Field } from "~/components/ui";
import { apiRequest, errorText } from "~/lib/api-client";
import { cx, fmt, useRoot } from "~/lib/i18n";
import { panelGet } from "~/lib/panel.server";
import type { BoardView } from "~/lib/panel-types";
import { metaFor } from "~/lib/seo";
import { allTimeZones, browserTz } from "~/lib/time";
import { usePanel } from "./_panel";
import type { Route } from "./+types/welcome";

interface Countries {
  years: number[];
  countries: Array<{ code: string; name: string }>;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  return { countries: await panelGet<Countries>(request, context, "/api/v1/holidays/countries") };
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.panel.welcome.seoTitle, indexable: false }));

const TYPES = ["public", "bank", "school", "optional", "observance"] as const;

/** Asistente de alta: plan → tablero → horario → feriados → servicio → compartir. */
export default function Welcome({ loaderData }: Route.ComponentProps) {
  const { site, t } = useRoot();
  const w = t.panel.welcome;
  const { org, me } = usePanel();
  const [step, setStep] = useState(org ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<"personal" | "branches">("personal");
  const [board, setBoard] = useState<BoardView | null>(null);
  const [tz, setTz] = useState("UTC");
  const [country, setCountry] = useState("");
  const [week, setWeek] = useState(defaultWeek);
  const [types, setTypes] = useState<string[]>(["public"]);
  const [preview, setPreview] = useState<Array<{ date: string; name: string }>>([]);
  const year = new Date().getFullYear();

  useEffect(() => {
    setTz(browserTz());
    const p = new URLSearchParams(window.location.search).get("plan");
    if (p === "branches" || p === "personal") setPlan(p);
  }, []);

  useEffect(() => {
    if (step !== 3 || !board || !country) return;
    void apiRequest("PUT", `/api/v1/calendars/${board.id}/holidays`, {
      policies: [{ country, types, substitutes: true }],
    })
      .then(() =>
        apiRequest<Array<{ date: string; name: string }>>(
          "GET",
          `/api/v1/calendars/${board.id}/holidays?from=${year}-01-01&to=${year}-12-31`,
        ),
      )
      .then(setPreview)
      .catch(() => setPreview([]));
  }, [step, board, country, types, year]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setStep((s) => s + 1);
    } catch (err) {
      setError(errorText(t.panel.errors, err));
    } finally {
      setBusy(false);
    }
  }

  const val = (e: FormEvent<HTMLFormElement>, k: string) =>
    String(new FormData(e.currentTarget).get(k) ?? "").trim();
  const total = w.steps.length;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">{w.title}</h1>
      <ol className="mt-4 flex flex-wrap gap-2 text-sm" aria-label={fmt(w.stepOf, { n: step + 1, total })}>
        {w.steps.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={cx(
              "rounded-full px-3 py-1",
              i === step
                ? "bg-primary text-on-primary"
                : i < step
                  ? "bg-primary-soft text-primary"
                  : "bg-surface-2 text-muted",
            )}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>
      <Card className="mt-6 p-6">
        {error ? (
          <Alert tone="danger" className="mb-5">
            {error}
          </Alert>
        ) : null}

        {step === 0 ? (
          <form
            method="post"
            onSubmit={(e) => {
              e.preventDefault();
              const name = val(e, "org");
              void run(async () => {
                await apiRequest("POST", "/api/v1/org", { name, plan });
              });
            }}
            className="space-y-5"
          >
            <h2 className="text-xl font-semibold">{w.plan.title}</h2>
            <p className="text-muted">{w.plan.lead}</p>
            <Field
              label={w.plan.orgName}
              name="org"
              required
              maxLength={120}
              defaultValue={me.name ? `${me.name}` : ""}
            />
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">{w.steps[0]}</legend>
              {(["personal", "branches"] as const).map((k) => {
                const pl = t.public.pricing.plans[k];
                return (
                  <label
                    key={k}
                    className={cx(
                      "flex cursor-pointer flex-col rounded-[var(--radius-card)] border p-4",
                      plan === k ? "border-primary ring-1 ring-primary" : "border-border",
                    )}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <input
                        type="radio"
                        name="plan"
                        value={k}
                        checked={plan === k}
                        onChange={() => setPlan(k)}
                        className="size-4 accent-[var(--primary)]"
                      />
                      {pl.name} · {pl.price}
                      {t.public.pricing.perMonth.startsWith("/")
                        ? t.public.pricing.perMonth
                        : ` ${t.public.pricing.perMonth}`}
                    </span>
                    <span className="mt-1 text-sm text-muted">{pl.description}</span>
                  </label>
                );
              })}
            </fieldset>
            <Button type="submit" size="lg" loading={busy} data-umami-event="trial_started">
              {w.next}
            </Button>
          </form>
        ) : null}

        {step === 1 ? (
          <form
            method="post"
            onSubmit={(e) => {
              e.preventDefault();
              const body = {
                name: val(e, "name"),
                timezone: tz,
                ...(country ? { country } : {}),
                ...(val(e, "address") ? { address: val(e, "address") } : {}),
              };
              void run(async () => {
                setBoard(await apiRequest<BoardView>("POST", "/api/v1/calendars", body));
              });
            }}
            className="space-y-5"
          >
            <h2 className="text-xl font-semibold">{w.calendar.title}</h2>
            <p className="text-muted">{w.calendar.lead}</p>
            <Field label={w.calendar.name} name="name" required maxLength={120} />
            <Select label={w.calendar.timezone} value={tz} onChange={(e) => setTz(e.target.value)}>
              {allTimeZones().map((z) => (
                <option key={z} value={z}>
                  {z.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
            <Select
              label={w.calendar.country}
              hint={w.calendar.countryHint}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              <option value="">—</option>
              {loaderData.countries.countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Field
              label={w.calendar.address}
              name="address"
              optional
              maxLength={240}
              autoComplete="street-address"
            />
            <Button type="submit" size="lg" loading={busy} data-umami-event="calendar_created">
              {w.next}
            </Button>
          </form>
        ) : null}

        {step === 2 && board ? (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold">{w.hours.title}</h2>
            <p className="text-muted">{w.hours.lead}</p>
            <HoursEditor week={week} onChange={setWeek} />
            <Button
              size="lg"
              loading={busy}
              onClick={() =>
                void run(
                  async () =>
                    void (await apiRequest("PUT", `/api/v1/calendars/${board.id}/hours`, {
                      shifts: shiftsFromWeek(week, w.hours.breakLabel),
                    })),
                )
              }
            >
              {w.next}
            </Button>
          </div>
        ) : null}

        {step === 3 && board ? (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold">{w.holidays.title}</h2>
            {country ? (
              <>
                <p className="text-muted">{w.holidays.lead}</p>
                <fieldset>
                  <legend className="text-[15px] font-medium">{w.holidays.types}</legend>
                  <div className="mt-2 flex flex-wrap gap-4">
                    {TYPES.map((ty) => (
                      <Checkbox
                        key={ty}
                        label={t.panel.holidayTypes[ty]}
                        checked={types.includes(ty)}
                        onChange={(e) =>
                          setTypes((cur) =>
                            e.target.checked
                              ? [...cur, ty]
                              : cur.filter((x) => x !== ty).length
                                ? cur.filter((x) => x !== ty)
                                : cur,
                          )
                        }
                      />
                    ))}
                  </div>
                </fieldset>
                <h3 className="font-semibold">{fmt(w.holidays.preview, { year })}</h3>
                {preview.length === 0 ? (
                  <p className="text-muted">{w.holidays.none}</p>
                ) : (
                  <ul className="max-h-64 divide-y divide-border overflow-auto rounded-[var(--radius-field)] border border-border">
                    {preview.map((h) => (
                      <li
                        key={`${h.date}${h.name}`}
                        className="flex justify-between gap-3 px-3 py-2 text-[15px]"
                      >
                        <span>{h.name}</span>
                        <span className="text-muted tabular">
                          {new Intl.DateTimeFormat(site.lang === "es" ? "es-MX" : "en-US", {
                            day: "numeric",
                            month: "short",
                            timeZone: "UTC",
                          }).format(new Date(`${h.date}T12:00:00Z`))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-muted">{w.holidays.none}</p>
            )}
            <Button size="lg" onClick={() => setStep(4)}>
              {w.next}
            </Button>
          </div>
        ) : null}

        {step === 4 && board ? (
          <form
            method="post"
            onSubmit={(e) => {
              e.preventDefault();
              const name = val(e, "service");
              const duration = Number(val(e, "duration"));
              void run(async () => {
                await apiRequest("POST", `/api/v1/calendars/${board.id}/services`, {
                  name: { [site.lang]: name },
                  durationMin: duration,
                  slotStepMin: [15, 20, 30, 45, 60, 90, 120].includes(duration) ? duration : 30,
                });
              });
            }}
            className="space-y-5"
          >
            <h2 className="text-xl font-semibold">{w.service.title}</h2>
            <p className="text-muted">{w.service.lead}</p>
            <Field label={w.service.name} name="service" required maxLength={120} />
            <Field
              label={w.service.duration}
              name="duration"
              type="number"
              min={5}
              max={720}
              step={5}
              defaultValue={30}
              required
              className="max-w-48"
            />
            <div className="flex gap-3">
              <Button type="submit" size="lg" loading={busy}>
                {w.next}
              </Button>
              <Button variant="ghost" onClick={() => setStep(5)}>
                {w.skip}
              </Button>
            </div>
          </form>
        ) : null}

        {step === 5 && board ? (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold">{w.share.title}</h2>
            <p className="text-muted">{w.share.lead}</p>
            {(() => {
              const s = embedSnippets(site.siteUrl, site.lang, board.slug, board.name);
              return (
                <>
                  <CopyField label={t.panel.settings.link} value={s.link} />
                  <CopyField
                    label={t.panel.settings.embedIframe}
                    value={s.iframe}
                    multiline
                    event="embed_copied"
                  />
                  <CopyField
                    label={t.panel.settings.embedScript}
                    value={s.script}
                    multiline
                    event="embed_copied"
                  />
                </>
              );
            })()}
            <Button
              size="lg"
              onClick={() => window.location.assign(pathFor("calendar", site.lang, { id: board.id }))}
            >
              {w.finish}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
