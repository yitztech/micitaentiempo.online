import { pathFor } from "@mcet/i18n";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AuthCard } from "~/components/auth";
import { Alert, Button, Field, LinkButton } from "~/components/ui";
import { errorText, postJson } from "~/lib/api-client";
import { useRoot } from "~/lib/i18n";
import { metaFor } from "~/lib/seo";
import type { Route } from "./+types/reset-password";

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.auth.reset.seoTitle, indexable: false }));

export default function ResetPassword() {
  const { site, t } = useRoot();
  const s = t.auth.reset;
  const [params] = useSearchParams();
  const token = params.get("token");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/auth/reset-password", {
        token,
        newPassword: String(new FormData(e.currentTarget).get("password") ?? ""),
      });
      setDone(true);
    } catch (err) {
      setError(errorText(t.auth.errors, err));
    } finally {
      setBusy(false);
    }
  }

  if (!token || params.get("error")) {
    return (
      <AuthCard title={s.title}>
        <Alert tone="danger">{s.invalidLink}</Alert>
        <LinkButton to={pathFor("forgotPassword", site.lang)} variant="secondary" className="mt-6 w-full">
          {t.auth.forgot.submit}
        </LinkButton>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={s.title}>
      {done ? (
        <>
          <Alert tone="success">{s.done}</Alert>
          <LinkButton to={pathFor("signIn", site.lang)} className="mt-6 w-full">
            {t.common.nav.signIn}
          </LinkButton>
        </>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          <Field
            label={t.auth.fields.newPassword}
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            hint={t.auth.fields.passwordHint}
          />
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {s.submit}
          </Button>
          <p className="text-center text-[15px]">
            <Link to={pathFor("signIn", site.lang)} className="text-primary underline underline-offset-2">
              {t.common.nav.signIn}
            </Link>
          </p>
        </form>
      )}
    </AuthCard>
  );
}
