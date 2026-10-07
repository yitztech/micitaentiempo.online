import { type FormEvent, useEffect, useState } from "react";
import { useRevalidator, useSearchParams } from "react-router";
import { Alert, Button, Card, Checkbox, Field } from "~/components/ui";
import { apiRequest, errorText } from "~/lib/api-client";
import { fmt, useRoot } from "~/lib/i18n";
import { panelGet } from "~/lib/panel.server";
import { metaFor } from "~/lib/seo";
import { usePanel } from "./_panel";
import type { Route } from "./+types/notification-settings";

const GROUPS = ["bookings", "changes", "reminders", "billing", "system"] as const;
const CHANNELS = ["email", "telegram", "slack", "whatsapp"] as const;
type ChannelState = {
  available: boolean;
  status: "active" | "pending" | "disabled" | null;
  label: string | null;
};
interface Prefs {
  matrix: Record<(typeof GROUPS)[number], Record<(typeof CHANNELS)[number], boolean>>;
  mutes: string[];
  channels: Record<(typeof CHANNELS)[number], ChannelState>;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  return panelGet<Prefs>(request, context, "/api/v1/notification-preferences");
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.panel.prefs.seoTitle, indexable: false }));

/** Preferencias de avisos: matriz grupo × canal, canales conectados y tableros silenciados. */
export default function NotificationSettings({ loaderData }: Route.ComponentProps) {
  const { t } = useRoot();
  const p = t.panel.prefs;
  const { calendars } = usePanel();
  const revalidator = useRevalidator();
  const [params] = useSearchParams();
  const [matrix, setMatrix] = useState(loaderData.matrix);
  const [mutes, setMutes] = useState(loaderData.mutes);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null);
  const [waSent, setWaSent] = useState(false);
  useEffect(() => setMatrix(loaderData.matrix), [loaderData.matrix]);
  useEffect(() => {
    const slack = params.get("slack");
    if (slack) setMsg({ ok: slack === "ok", text: slack === "ok" ? p.slackOk : p.slackError });
  }, [params, p.slackOk, p.slackError]);

  const usable = CHANNELS.filter(
    (c) => c === "email" || (loaderData.channels[c].available && loaderData.channels[c].status === "active"),
  );
  const fail = (err: unknown) => setMsg({ ok: false, text: errorText(t.panel.errors, err) });

  async function save() {
    try {
      await apiRequest("PUT", "/api/v1/notification-preferences", { matrix, mutes });
      setMsg({ ok: true, text: p.saved });
      void revalidator.revalidate();
    } catch (err) {
      fail(err);
    }
  }

  async function whatsapp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      if (!waSent) {
        await apiRequest("POST", "/api/v1/channels/whatsapp/verify", {
          phone: String(f.get("phone") ?? "").replace(/\s/g, ""),
        });
        setWaSent(true);
      } else {
        await apiRequest("POST", "/api/v1/channels/whatsapp/confirm", { code: String(f.get("code") ?? "") });
        setMsg({ ok: true, text: p.whatsappOk });
        void revalidator.revalidate();
      }
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{p.title}</h1>
        <p className="mt-2 text-muted">{p.lead}</p>
      </div>
      {msg ? <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert> : null}

      <Card className="overflow-x-auto p-6">
        <table className="w-full text-left text-[15px]">
          <caption className="sr-only">{p.title}</caption>
          <thead>
            <tr className="text-sm text-muted">
              <th scope="col" className="pb-3 font-medium">
                {p.group}
              </th>
              {usable.map((c) => (
                <th key={c} scope="col" className="pb-3 text-center font-medium">
                  {p.channels[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {GROUPS.map((g) => (
              <tr key={g}>
                <th scope="row" className="py-3 font-medium">
                  {p.groups[g]}
                </th>
                {usable.map((c) => (
                  <td key={c} className="py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${p.groups[g]} · ${p.channels[c]}`}
                      checked={matrix[g][c]}
                      onChange={(e) => setMatrix({ ...matrix, [g]: { ...matrix[g], [c]: e.target.checked } })}
                      className="size-5 accent-[var(--primary)]"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {calendars.length ? (
          <fieldset className="mt-6">
            <legend className="text-[15px] font-medium">{p.mutes}</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {calendars.map((c) => (
                <Checkbox
                  key={c.id}
                  label={c.name}
                  checked={mutes.includes(c.id)}
                  onChange={(e) =>
                    setMutes(e.target.checked ? [...mutes, c.id] : mutes.filter((x) => x !== c.id))
                  }
                />
              ))}
            </div>
          </fieldset>
        ) : null}
        <Button className="mt-6" onClick={() => void save()}>
          {p.save}
        </Button>
      </Card>

      <Card className="space-y-6 p-6">
        <h2 className="text-lg font-semibold">{p.connections}</h2>
        {(["telegram", "slack", "whatsapp"] as const)
          .filter((c) => loaderData.channels[c].available)
          .map((c) => {
            const st = loaderData.channels[c];
            return (
              <section key={c} aria-labelledby={`canal-${c}`} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 id={`canal-${c}`} className="font-semibold">
                      {p.channels[c]}
                    </h3>
                    <p className="text-sm text-muted">
                      {st.status === "active"
                        ? fmt(p.connected, { label: st.label ?? "" })
                        : st.status === "disabled"
                          ? p.disabled
                          : p.notConnected}
                    </p>
                  </div>
                  {st.status === "active" ? (
                    <Button
                      variant="ghost"
                      className="text-danger"
                      onClick={() =>
                        void apiRequest("DELETE", `/api/v1/channels/${c}`).then(() =>
                          revalidator.revalidate(),
                        )
                      }
                    >
                      {p.disconnect}
                    </Button>
                  ) : c === "telegram" ? (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void apiRequest<{ url: string }>("POST", "/api/v1/channels/telegram/link").then(
                          (r) => setTelegramUrl(r.url),
                          fail,
                        )
                      }
                    >
                      {p.connect}
                    </Button>
                  ) : c === "slack" ? (
                    <a
                      href="/api/v1/integrations/slack/install"
                      className="inline-flex min-h-11 items-center rounded-[var(--radius-field)] border border-border px-4 font-medium hover:bg-surface-2"
                    >
                      {p.connect}
                    </a>
                  ) : null}
                </div>
                {c === "telegram" && telegramUrl && st.status !== "active" ? (
                  <Alert>
                    {p.telegramHelp}{" "}
                    <a
                      href={telegramUrl}
                      target="_blank"
                      rel="noopener"
                      className="font-medium text-primary underline underline-offset-2"
                    >
                      {p.openTelegram}
                    </a>
                  </Alert>
                ) : null}
                {c === "whatsapp" && st.status !== "active" ? (
                  <form onSubmit={whatsapp} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    {waSent ? (
                      <Field
                        label={p.code}
                        name="code"
                        inputMode="numeric"
                        pattern="\d{6}"
                        maxLength={6}
                        required
                      />
                    ) : (
                      <Field
                        label={p.phone}
                        name="phone"
                        type="tel"
                        placeholder="+52 55 1234 5678"
                        required
                      />
                    )}
                    <Button type="submit" variant="secondary">
                      {waSent ? p.verify : p.sendCode}
                    </Button>
                  </form>
                ) : null}
              </section>
            );
          })}
      </Card>
    </div>
  );
}
