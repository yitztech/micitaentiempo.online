import { pathFor } from "@mcet/i18n";
import { useState } from "react";
import { data, useLocation } from "react-router";
import { AuthCard, GoogleButton } from "~/components/auth";
import { Alert, Button, LinkButton } from "~/components/ui";
import { apiGet } from "~/lib/api.server";
import { type ApiError, errorText, postJson } from "~/lib/api-client";
import { fmt, useRoot } from "~/lib/i18n";
import { metaFor } from "~/lib/seo";
import type { Route } from "./+types/invitation";

interface Preview {
  role: "editor" | "observer";
  requiresGoogle: boolean;
  emailHint: string;
  calendarName: string | null;
  inviterName: string | null;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const res = await apiGet<Preview>(
    request,
    `/api/public/v1/invitations/${encodeURIComponent(params.token ?? "")}`,
  );
  if (res.status !== 200 || !res.body) return { preview: null, token: params.token ?? "" };
  return data({ preview: res.body, token: params.token ?? "" });
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.auth.invitation.seoTitle, indexable: false }));

type Outcome = "accepted" | "signIn" | "google" | "wrongEmail" | "invalid" | null;

export default function Invitation({ loaderData }: Route.ComponentProps) {
  const { site, t } = useRoot();
  const s = t.auth.invitation;
  const { pathname } = useLocation();
  const { preview, token } = loaderData;
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(preview ? null : "invalid");
  const [error, setError] = useState<string | null>(null);
  const next = encodeURIComponent(pathname);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/v1/invitations/${encodeURIComponent(token)}/accept`, {});
      setOutcome("accepted");
    } catch (err) {
      const code = (err as ApiError).code;
      if ((err as ApiError).status === 401) setOutcome("signIn");
      else if (code === "google_required") setOutcome("google");
      else if (code === "invitation_email_mismatch") setOutcome("wrongEmail");
      else if ((err as ApiError).status === 404) setOutcome("invalid");
      else setError(errorText(t.auth.errors, err));
    } finally {
      setBusy(false);
    }
  }

  if (outcome === "invalid" || !preview) {
    return (
      <AuthCard title={s.title}>
        <Alert tone="danger">{s.invalid}</Alert>
      </AuthCard>
    );
  }
  const email = preview.emailHint;
  return (
    <AuthCard
      title={s.title}
      lead={fmt(s.body, {
        inviter: preview.inviterName ?? "",
        calendar: preview.calendarName ?? "",
        role: s.roles[preview.role],
      })}
    >
      {outcome === "accepted" ? (
        <>
          <Alert tone="success">{s.accepted}</Alert>
          <LinkButton to={pathFor("dashboard", site.lang)} className="mt-6 w-full">
            {t.common.nav.dashboard}
          </LinkButton>
        </>
      ) : outcome === "signIn" ? (
        <>
          <Alert tone="info">
            {preview.requiresGoogle ? fmt(s.googleRequired, { email }) : fmt(s.signInFirst, { email })}
          </Alert>
          <div className="mt-6 space-y-3">
            <GoogleButton callbackURL={pathname} divider={false} />
            {preview.requiresGoogle ? null : (
              <>
                <LinkButton to={`${pathFor("signIn", site.lang)}?next=${next}`} className="w-full">
                  {t.common.nav.signIn}
                </LinkButton>
                <LinkButton to={pathFor("signUp", site.lang)} variant="secondary" className="w-full">
                  {t.common.nav.signUp}
                </LinkButton>
              </>
            )}
          </div>
        </>
      ) : outcome === "google" ? (
        <>
          <Alert tone="info">{fmt(s.googleRequired, { email })}</Alert>
          <div className="mt-6">
            <GoogleButton callbackURL={pathname} divider={false} />
          </div>
        </>
      ) : (
        <>
          {outcome === "wrongEmail" ? (
            <Alert tone="warning" className="mb-5">
              {fmt(s.wrongEmail, { email })}
            </Alert>
          ) : null}
          {error ? (
            <Alert tone="danger" className="mb-5">
              {error}
            </Alert>
          ) : null}
          <Button size="lg" className="w-full" loading={busy} onClick={() => void accept()}>
            {s.accept}
          </Button>
        </>
      )}
    </AuthCard>
  );
}
