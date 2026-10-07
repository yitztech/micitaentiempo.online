import { type FormEvent, useState } from "react";
import { AuthCard } from "~/components/auth";
import { Alert, Button, Checkbox } from "~/components/ui";
import { apiRequest, postJson } from "~/lib/api-client";
import { fmt, useRoot } from "~/lib/i18n";
import { type OAuthRedirect, oauthNext, signedOAuthQuery } from "~/lib/oauth";
import { panelGet } from "~/lib/panel.server";
import type { BoardView } from "~/lib/panel-types";
import { metaFor } from "~/lib/seo";
import type { Route } from "./+types/oauth-consent";

interface ClientInfo {
  clientId: string;
  name: string;
  domain: string | null;
  verified: boolean;
}

/** Permisos que el usuario no puede desmarcar (sin ellos la conexión no sirve). */
const REQUIRED = new Set(["openid", "profile", "email", "offline_access", "calendar:read"]);

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id") ?? "";
  const scopes = (url.searchParams.get("scope") ?? "").split(" ").filter(Boolean);
  if (!clientId || !url.searchParams.has("sig")) return { client: null, scopes, calendars: [] };
  const [client, calendars] = await Promise.all([
    panelGet<ClientInfo>(request, context, `/api/v1/ai/clients/${encodeURIComponent(clientId)}`).catch(
      () => null,
    ),
    panelGet<BoardView[]>(request, context, "/api/v1/calendars"),
  ]);
  return { client, scopes, calendars };
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.auth.consent.seoTitle, indexable: false }));

/**
 * Consentimiento OAuth de una aplicación de IA (docs/plan/06-mcp.md §6.2): quién pide acceso, qué
 * podrá hacer (en lenguaje claro) y a qué tableros.
 */
export default function OAuthConsent({ loaderData }: Route.ComponentProps) {
  const { t } = useRoot();
  const s = t.auth.consent;
  const { client, scopes, calendars } = loaderData;
  const scopeText = t.common.aiScopes as Record<string, string>;
  const [granted, setGranted] = useState(() => new Set(scopes));
  const [all, setAll] = useState(true);
  const [boards, setBoards] = useState(() => new Set(calendars.map((c) => c.id)));
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!client) {
    return (
      <AuthCard title={s.seoTitle}>
        <Alert tone="danger">{s.invalid}</Alert>
      </AuthCard>
    );
  }
  const app = client.name;

  async function finish(accept: boolean) {
    const oauthQuery = signedOAuthQuery(window.location.search);
    const res = await postJson<OAuthRedirect>("/api/auth/oauth2/consent", {
      accept,
      ...(accept ? { scope: scopes.filter((x) => granted.has(x)).join(" ") } : {}),
      oauth_query: oauthQuery,
    });
    const next = oauthNext(res);
    if (!next) throw new Error("no redirect");
    window.location.assign(next);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!client) return;
    if (!all && boards.size === 0) {
      setError(s.noBoards);
      return;
    }
    setBusy("allow");
    setError(null);
    try {
      await apiRequest("PUT", "/api/v1/ai/grants", {
        clientId: client.clientId,
        calendarIds: all ? [] : [...boards],
        scopes: scopes.filter((x) => granted.has(x)),
      });
      await finish(true);
    } catch {
      setError(s.error);
      setBusy(null);
    }
  }

  async function onDeny() {
    setBusy("deny");
    try {
      await finish(false);
    } catch {
      setError(s.error);
      setBusy(null);
    }
  }

  const toggle = (set: Set<string>, value: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(value);
    else next.delete(value);
    return next;
  };

  return (
    <AuthCard
      title={fmt(s.title, { app })}
      lead={
        client.domain
          ? fmt(client.verified ? s.verified : s.unverified, { domain: client.domain })
          : undefined
      }
    >
      <form onSubmit={onSubmit} className="space-y-6">
        <fieldset>
          <legend className="mb-2 font-medium">{s.permissions}</legend>
          <ul className="space-y-1">
            {scopes
              .filter((x) => scopeText[x] && x !== "openid")
              .map((x) => (
                <li key={x}>
                  <Checkbox
                    label={scopeText[x] ?? x}
                    checked={granted.has(x)}
                    disabled={REQUIRED.has(x)}
                    onChange={(e) => setGranted(toggle(granted, x, e.currentTarget.checked))}
                  />
                </li>
              ))}
          </ul>
        </fieldset>
        {calendars.length > 0 ? (
          <fieldset>
            <legend className="mb-2 font-medium">{s.boards}</legend>
            <Checkbox label={s.allBoards} checked={all} onChange={(e) => setAll(e.currentTarget.checked)} />
            {all ? null : (
              <div className="mt-2 space-y-1 border-l border-border pl-4">
                <p className="text-sm text-muted">{s.someBoards}</p>
                {calendars.map((c) => (
                  <Checkbox
                    key={c.id}
                    label={c.name}
                    checked={boards.has(c.id)}
                    onChange={(e) => setBoards(toggle(boards, c.id, e.currentTarget.checked))}
                  />
                ))}
              </div>
            )}
          </fieldset>
        ) : null}
        <p className="text-sm text-muted">{s.note}</p>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            loading={busy === "deny"}
            onClick={() => void onDeny()}
          >
            {s.deny}
          </Button>
          <Button type="submit" size="lg" loading={busy === "allow"} disabled={busy !== null}>
            {s.allow}
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
