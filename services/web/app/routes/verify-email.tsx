import { pathFor } from "@mcet/i18n";
import { type FormEvent, useState } from "react";
import { useSearchParams } from "react-router";
import { AuthCard } from "~/components/auth";
import { Alert, Button, Field } from "~/components/ui";
import { errorText, postJson } from "~/lib/api-client";
import { useRoot } from "~/lib/i18n";
import { metaFor } from "~/lib/seo";
import type { Route } from "./+types/verify-email";

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.auth.verify.seoTitle, indexable: false }));

export default function VerifyEmail() {
  const { site, t } = useRoot();
  const s = t.auth.verify;
  const [params] = useSearchParams();
  const failed = Boolean(params.get("error"));
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/auth/send-verification-email", {
        email: String(new FormData(e.currentTarget).get("email") ?? "").trim(),
        callbackURL: pathFor("dashboard", site.lang),
      });
      setResent(true);
    } catch (err) {
      setError(errorText(t.auth.errors, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title={s.title} lead={failed ? undefined : s.body}>
      {failed ? (
        <Alert tone="danger" className="mb-5">
          {s.failed}
        </Alert>
      ) : null}
      {resent ? (
        <Alert tone="success">{s.resent}</Alert>
      ) : (
        <form method="post" onSubmit={onSubmit} className="space-y-5">
          <Field
            label={t.auth.fields.email}
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={params.get("email") ?? ""}
          />
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" variant="secondary" size="lg" className="w-full" loading={busy}>
            {s.resend}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
