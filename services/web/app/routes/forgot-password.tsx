import { pathFor } from "@mcet/i18n";
import { EmailField } from "@mcet/schemas";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { AuthCard } from "~/components/auth";
import { Alert, Button, Field } from "~/components/ui";
import { errorText, postJson } from "~/lib/api-client";
import { useRoot } from "~/lib/i18n";
import { metaFor } from "~/lib/seo";
import type { Route } from "./+types/forgot-password";

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.auth.forgot.seoTitle, indexable: false }));

export default function ForgotPassword() {
  const { site, t } = useRoot();
  const s = t.auth.forgot;
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!EmailField.safeParse(email).success) {
      setError(t.auth.errors.invalid_format);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/auth/request-password-reset", {
        email,
        redirectTo: pathFor("resetPassword", site.lang),
      });
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
        <form method="post" onSubmit={onSubmit} className="space-y-5">
          <Field
            label={t.auth.fields.email}
            name="email"
            type="email"
            autoComplete="email"
            required
            minLength={5}
            maxLength={254}
          />
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {s.submit}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
