import { pathFor } from "@mcet/i18n";
import { Bot, KeyRound, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useRevalidator } from "react-router";
import { CopyField } from "~/components/copy-field";
import { Dialog } from "~/components/dialog";
import { Alert, Badge, Button, Card, Field } from "~/components/ui";
import { apiRequest, errorText, postJson } from "~/lib/api-client";
import { fmt, useRoot } from "~/lib/i18n";
import { panelGet, panelGetOptional } from "~/lib/panel.server";
import type { BoardView, Org } from "~/lib/panel-types";
import { metaFor } from "~/lib/seo";
import { formatDateTime } from "~/lib/time";
import type { Route } from "./+types/ai";

interface Connection {
  clientId: string;
  name: string;
  domain: string | null;
  verified: boolean;
  static: boolean;
  scopes: string[];
  calendarIds: string[];
  connectedAt: string;
  lastUsedAt: string | null;
}
interface StaticClient {
  clientId: string;
  name: string;
  redirectUris: string[];
}
interface CreatedClient {
  clientId: string;
  clientSecret: string | null;
  redirectUri: string;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const [connections, org, calendars] = await Promise.all([
    panelGet<Connection[]>(request, context, "/api/v1/ai/connections"),
    panelGetOptional<Org>(request, context, "/api/v1/org"),
    panelGet<BoardView[]>(request, context, "/api/v1/calendars"),
  ]);
  const staticClients = org
    ? await panelGet<StaticClient[]>(request, context, "/api/v1/ai/static-clients")
    : [];
  return { connections, staticClients, owner: Boolean(org), calendars };
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.panel.ai.seoTitle, indexable: false }));

/** Panel → IA: URL del servidor MCP, aplicaciones conectadas y credenciales de Gemini Enterprise. */
export default function AiPage({ loaderData }: Route.ComponentProps) {
  const { site, t } = useRoot();
  const a = t.panel.ai;
  const scopeText = t.common.aiScopes as Record<string, string>;
  const { connections, staticClients, owner, calendars } = loaderData;
  const revalidator = useRevalidator();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [revoking, setRevoking] = useState<Connection | null>(null);
  const [created, setCreated] = useState<CreatedClient | null>(null);
  const [busy, setBusy] = useState(false);
  const tz = calendars[0]?.timezone ?? "UTC";

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      if (ok) setMsg({ ok: true, text: ok });
      void revalidator.revalidate();
    } catch (err) {
      setMsg({ ok: false, text: errorText(t.panel.errors, err) });
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    await run(async () => setCreated(await postJson<CreatedClient>("/api/v1/ai/static-clients", { name })));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold">{a.title}</h1>
        <p className="mt-2 text-muted">{a.lead}</p>
      </header>

      {msg ? <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert> : null}

      <Card className="space-y-4">
        <CopyField label={a.serverUrl} value={`${site.siteUrl}/mcp`} event="ai-copy-url" />
        <Link
          to={pathFor("connectAi", site.lang)}
          className="inline-flex min-h-11 items-center text-primary underline"
        >
          {a.howTo}
        </Link>
      </Card>

      <section aria-labelledby="ai-connected">
        <h2 id="ai-connected" className="mb-3 text-xl font-semibold">
          {a.connected}
        </h2>
        {connections.length === 0 ? (
          <p className="text-muted">{a.none}</p>
        ) : (
          <ul className="space-y-3">
            {connections.map((c) => (
              <li key={c.clientId}>
                <Card className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <Bot aria-hidden className="size-5 shrink-0" />
                      <span className="truncate">{c.name}</span>
                    </p>
                    {c.domain ? (
                      <p className="mt-1 flex items-center gap-1 text-sm text-muted">
                        {c.domain}
                        {c.verified ? (
                          <Badge className="ml-1">
                            <ShieldCheck aria-hidden className="size-3.5" /> {a.verified}
                          </Badge>
                        ) : null}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm text-muted">
                      {c.calendarIds.length
                        ? fmt(a.boardsCount, { count: c.calendarIds.length })
                        : a.allBoards}
                      {" · "}
                      {c.lastUsedAt
                        ? fmt(a.lastUsed, { when: formatDateTime(c.lastUsedAt, site.lang, tz) })
                        : a.never}
                    </p>
                    <ul className="mt-2 list-disc pl-5 text-sm">
                      {c.scopes
                        .filter((x) => scopeText[x] && x !== "openid")
                        .map((x) => (
                          <li key={x}>{scopeText[x]}</li>
                        ))}
                    </ul>
                  </div>
                  <Button
                    variant="danger"
                    onClick={() => setRevoking(c)}
                    aria-label={`${a.revoke}: ${c.name}`}
                  >
                    {a.revoke}
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ai-gemini">
        <h2 id="ai-gemini" className="mb-1 flex items-center gap-2 text-xl font-semibold">
          <KeyRound aria-hidden className="size-5" />
          {a.gemini}
        </h2>
        <p className="mb-3 text-muted">{a.geminiLead}</p>
        {owner ? (
          <Card className="space-y-4">
            {created ? (
              <div className="space-y-3">
                <Alert tone="warning">{a.geminiOnce}</Alert>
                <CopyField label={a.clientId} value={created.clientId} />
                {created.clientSecret ? (
                  <CopyField label={a.clientSecret} value={created.clientSecret} />
                ) : null}
                <CopyField label={a.redirectUri} value={created.redirectUri} />
              </div>
            ) : null}
            {staticClients.length ? (
              <ul className="divide-y divide-border">
                {staticClients.map((c) => (
                  <li key={c.clientId} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block truncate font-mono text-xs text-muted">{c.clientId}</span>
                    </span>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          apiRequest("DELETE", `/api/v1/ai/static-clients/${encodeURIComponent(c.clientId)}`),
                        )
                      }
                    >
                      {a.delete}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <form method="post" onSubmit={onCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field
                label={a.geminiName}
                name="name"
                required
                maxLength={80}
                defaultValue="Gemini Enterprise"
              />
              <Button type="submit" loading={busy}>
                {a.geminiCreate}
              </Button>
            </form>
          </Card>
        ) : (
          <p className="text-sm text-muted">{a.ownerOnly}</p>
        )}
      </section>

      <section aria-labelledby="ai-examples">
        <h2 id="ai-examples" className="mb-3 text-xl font-semibold">
          {a.examples}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          {a.exampleList.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </section>

      <Dialog open={revoking !== null} onClose={() => setRevoking(null)} title={a.revoke}>
        <p>{fmt(a.revokeConfirm, { app: revoking?.name ?? "" })}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setRevoking(null)}>
            {a.keep}
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={() => {
              const c = revoking;
              setRevoking(null);
              if (c)
                void run(
                  () => apiRequest("DELETE", `/api/v1/ai/connections/${encodeURIComponent(c.clientId)}`),
                  a.revoked,
                );
            }}
          >
            {a.revoke}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
