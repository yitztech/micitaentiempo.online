import { CalendarSync, RefreshCw } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { apiRequest, errorText } from "~/lib/api-client";
import { fmt, useRoot } from "~/lib/i18n";
import { formatDateTime } from "~/lib/time";
import { CopyField } from "./copy-field";
import { Alert, Button, Card, Checkbox, Field } from "./ui";

interface Conn {
  id: string;
  provider: "google" | "microsoft" | "icloud";
  account: string;
  status: "active" | "revoked" | "error";
  lastSyncAt: string | null;
  lastError: string | null;
  calendars: Array<{
    id: string;
    name: string;
    useAsBusy: boolean;
    writeTarget: boolean;
    appCreated: boolean;
  }>;
}
interface Feed {
  id: string;
  scope: "full" | "busy";
}

const NAMES = { google: "Google Calendar", microsoft: "Outlook", icloud: "iCloud" } as const;

/** Calendarios conectados (nivel 2) y suscripciones ICS (nivel 1) de un tablero. */
export function ConnectedCalendars({
  calendarId,
  isOwner,
  tz,
}: {
  calendarId: string;
  isOwner: boolean;
  tz: string;
}) {
  const { site, t } = useRoot();
  const s = t.panel.sync;
  const [params] = useSearchParams();
  const [data, setData] = useState<{
    connections: Conn[];
    available: { google: boolean; microsoft: boolean; icloud: boolean };
  } | null>(null);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [created, setCreated] = useState<{ url: string; webcal: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [icloud, setIcloud] = useState(false);
  const [busy, setBusy] = useState(false);
  const base = `/api/v1/calendars/${calendarId}`;
  const load = useCallback(() => {
    void apiRequest<typeof data>("GET", `${base}/integrations`)
      .then(setData)
      .catch(() => undefined);
    void apiRequest<Feed[]>("GET", `${base}/feeds`)
      .then(setFeeds)
      .catch(() => undefined);
  }, [base]);
  useEffect(() => {
    load();
    const st = params.get("sync");
    if (st) setMsg({ ok: st === "ok", text: st === "ok" ? s.ok : s.error });
  }, [load, params, s.ok, s.error]);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      load();
    } catch (err) {
      setMsg({ ok: false, text: errorText(t.panel.errors, err) });
    }
  };

  async function connectICloud(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    await run(() =>
      apiRequest("POST", `${base}/integrations/icloud`, {
        appleId: String(f.get("appleId")),
        appPassword: String(f.get("appPassword")),
      }),
    );
    setBusy(false);
    setIcloud(false);
  }

  return (
    <>
      <Card className="space-y-5 p-6">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CalendarSync aria-hidden className="size-5 text-primary" />
            {s.title}
          </h2>
          <p className="mt-1 text-muted">{s.lead}</p>
          <p className="mt-1 text-sm text-muted">{s.sourceOfTruth}</p>
        </div>
        {msg ? <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert> : null}
        <ul className="space-y-4">
          {(data?.connections ?? []).map((c) => (
            <li key={c.id} className="rounded-[var(--radius-field)] border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {NAMES[c.provider]} · {c.account}
                  </p>
                  <p className={c.status === "active" ? "text-sm text-success" : "text-sm text-danger"}>
                    {s.status[c.status]}
                  </p>
                  <p className="text-sm text-muted">
                    {c.lastSyncAt
                      ? fmt(s.lastSync, { date: formatDateTime(c.lastSyncAt, site.lang, tz) })
                      : s.never}
                  </p>
                  {c.lastError ? (
                    <p className="text-sm text-muted">{fmt(s.lastError, { error: c.lastError })}</p>
                  ) : null}
                </div>
                {isOwner ? (
                  <div className="flex flex-wrap gap-2">
                    {c.status === "revoked" && c.provider !== "icloud" ? (
                      <a
                        href={`/api/v1/integrations/${c.provider}/connect?calendar=${calendarId}`}
                        className="inline-flex min-h-11 items-center rounded-[var(--radius-field)] bg-primary px-4 font-medium text-on-primary"
                      >
                        {s.reconnect}
                      </a>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          void run(() => apiRequest("POST", `${base}/integrations/${c.id}/resync`))
                        }
                      >
                        <RefreshCw aria-hidden className="size-4" />
                        {s.resync}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="text-danger"
                      onClick={() => void run(() => apiRequest("DELETE", `${base}/integrations/${c.id}`))}
                    >
                      {s.disconnect}
                    </Button>
                  </div>
                ) : null}
              </div>
              <ul className="mt-3 space-y-2">
                {c.calendars.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[15px]">
                    <span className="min-w-40 font-medium">{x.name}</span>
                    {!x.appCreated ? (
                      <Checkbox
                        label={s.useAsBusy}
                        checked={x.useAsBusy}
                        disabled={!isOwner}
                        onChange={(e) =>
                          void run(() =>
                            apiRequest("PATCH", `${base}/integrations/${c.id}/calendars/${x.id}`, {
                              useAsBusy: e.target.checked,
                              writeTarget: x.writeTarget,
                            }),
                          )
                        }
                      />
                    ) : null}
                    <Checkbox
                      label={s.writeTarget}
                      checked={x.writeTarget}
                      disabled={!isOwner}
                      onChange={(e) =>
                        void run(() =>
                          apiRequest("PATCH", `${base}/integrations/${c.id}/calendars/${x.id}`, {
                            useAsBusy: x.useAsBusy,
                            writeTarget: e.target.checked,
                          }),
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        {isOwner ? (
          <div className="flex flex-wrap gap-2">
            {data?.available.google ? (
              <a
                href={`/api/v1/integrations/google/connect?calendar=${calendarId}`}
                className="inline-flex min-h-11 items-center rounded-[var(--radius-field)] border border-border px-4 font-medium hover:bg-surface-2"
              >
                {s.connectGoogle}
              </a>
            ) : null}
            {data?.available.microsoft ? (
              <a
                href={`/api/v1/integrations/microsoft/connect?calendar=${calendarId}`}
                className="inline-flex min-h-11 items-center rounded-[var(--radius-field)] border border-border px-4 font-medium hover:bg-surface-2"
              >
                {s.connectOutlook}
              </a>
            ) : null}
            <Button variant="secondary" onClick={() => setIcloud((v) => !v)} aria-expanded={icloud}>
              {s.connectIcloud}
            </Button>
          </div>
        ) : null}
        {icloud ? (
          <form method="post" onSubmit={connectICloud} className="grid gap-4 sm:grid-cols-2">
            <Field label={s.appleId} name="appleId" type="email" autoComplete="username" required />
            <Field
              label={s.appPassword}
              name="appPassword"
              type="password"
              autoComplete="off"
              required
              hint={s.appPasswordHint}
            />
            <div className="sm:col-span-2">
              <Button type="submit" loading={busy}>
                {s.connectIcloud}
              </Button>
            </div>
          </form>
        ) : null}
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">{s.feedsTitle}</h2>
          <p className="mt-1 text-muted">{s.feedsLead}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["full", "busy"] as const).map((scope) => (
            <Button
              key={scope}
              variant="secondary"
              onClick={() =>
                void run(async () =>
                  setCreated(
                    await apiRequest<{ url: string; webcal: string }>("POST", `${base}/feeds`, { scope }),
                  ),
                )
              }
            >
              {scope === "full" ? s.feedFull : s.feedBusy}
            </Button>
          ))}
        </div>
        {created ? (
          <div className="space-y-3">
            <Alert tone="warning">{s.feedCreated}</Alert>
            <CopyField label="webcal://" value={created.webcal} />
            <CopyField label="https://" value={created.url} />
            <p className="text-sm text-muted">{s.howTo}</p>
          </div>
        ) : null}
        <ul className="divide-y divide-border">
          {feeds.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2 text-[15px]">
              {s.scopes[f.scope]}
              <Button
                variant="ghost"
                className="text-danger"
                onClick={() => void run(() => apiRequest("DELETE", `${base}/feeds/${f.id}`))}
              >
                {s.revoke}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
