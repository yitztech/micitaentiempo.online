import { pathFor } from "@mcet/i18n";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { AltchaStatus } from "~/components/altcha-status";
import { AuthCard } from "~/components/auth";
import { Alert, Button, Field } from "~/components/ui";
import { useAltcha } from "~/lib/altcha";
import { errorText, postJson } from "~/lib/api-client";
import { useRoot } from "~/lib/i18n";
import { metaFor } from "~/lib/seo";
import type { Route } from "./+types/forgot-password";

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.auth.forgot.seoTitle, indexable: false }));

export default function ForgotPassword() {
  const { site, t } = useRoot();
  const s = t.auth.forgot;
  const altcha = useAltcha();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const token = await altcha.token();
      await postJson(
        "/api/auth/request-password-reset",
        { email, redirectTo: pathFor("resetPassword", site.lang) },
        { "x-altcha": token },
      );
      setSent(true);
    } catch (err) {
      setError(errorText(t.auth.errors, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={s.title}
      lead={sent ? undefined : s.lead}
      footer={
        <Link
          to={pathFor("signIn", site.lang)}
          className="font-medium text-primary underline underline-offset-2"
        >
          {t.common.nav.signIn}
        </Link>
      }
    >
      {sent ? (
        <Alert tone="success">{s.sent}</Alert>
      ) : (
        <form
          method="post"
          onSubmit={onSubmit}
          onFocus={() => void altcha.start().catch(() => undefined)}
          className="space-y-5"
        >
          <Field label={t.auth.fields.email} name="email" type="email" autoComplete="email" required />
          <AltchaStatus state={altcha.state} onRetry={() => void altcha.start().catch(() => undefined)} />
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {s.submit}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
