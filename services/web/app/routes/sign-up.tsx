import { pathFor } from "@mcet/i18n";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AltchaStatus } from "~/components/altcha-status";
import { AuthCard, GoogleButton } from "~/components/auth";
import { Alert, Button, Field } from "~/components/ui";
import { useAltcha } from "~/lib/altcha";
import { errorText, postJson } from "~/lib/api-client";
import { fmt, useRoot } from "~/lib/i18n";
import { metaFor } from "~/lib/seo";
import type { Route } from "./+types/sign-up";

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.auth.signUp.seoTitle, indexable: false }));

export default function SignUp() {
  const { site, t } = useRoot();
  const s = t.auth.signUp;
  const f = t.auth.fields;
  const [params] = useSearchParams();
  const plan = params.get("plan");
  const callbackURL = `${pathFor("dashboard", site.lang)}${plan === "personal" || plan === "branches" ? `?plan=${plan}` : ""}`;
  const altcha = useAltcha();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const token = await altcha.token();
      await postJson(
        "/api/auth/sign-up/email",
        {
          name: String(form.get("name") ?? "").trim(),
          email,
          password: String(form.get("password") ?? ""),
          callbackURL,
        },
        { "x-altcha": token },
      );
      setSentTo(email);
    } catch (err) {
      setError(errorText(t.auth.errors, err));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthCard title={s.checkTitle}>
        <Alert tone="success">{fmt(s.checkBody, { email: sentTo })}</Alert>
        <p className="mt-4 text-[15px] text-muted">
          {s.checkSpam}{" "}
          <Link
            to={`${pathFor("verifyEmail", site.lang)}?email=${encodeURIComponent(sentTo)}`}
            className="text-primary underline underline-offset-2"
          >
            {t.auth.verify.resend}
          </Link>
        </p>
      </AuthCard>
    );
  }

  const [before, after] = s.terms.split("{{terms}}");
  const [middle, end] = (after ?? "").split("{{privacy}}");
  return (
    <AuthCard
      title={s.title}
      lead={s.lead}
      footer={
        <>
          {s.haveAccount}{" "}
          <Link
            to={pathFor("signIn", site.lang)}
            className="font-medium text-primary underline underline-offset-2"
          >
            {t.common.nav.signIn}
          </Link>
        </>
      }
    >
      <GoogleButton callbackURL={callbackURL} />
      <form
        onSubmit={onSubmit}
        onFocus={() => void altcha.start().catch(() => undefined)}
        className="space-y-5"
      >
        <Field label={f.name} name="name" autoComplete="name" required maxLength={120} />
        <Field
          label={f.email}
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          hint={f.emailHint}
        />
        <Field
          label={f.password}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          hint={f.passwordHint}
        />
        <AltchaStatus state={altcha.state} onRetry={() => void altcha.start().catch(() => undefined)} />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={busy}
          data-umami-event="sign_up_completed"
        >
          {s.submit}
        </Button>
        <p className="text-sm text-muted">
          {before}
          <Link to={pathFor("terms", site.lang)} className="underline underline-offset-2">
            {s.termsLink}
          </Link>
          {middle}
          <Link to={pathFor("privacy", site.lang)} className="underline underline-offset-2">
            {s.privacyLink}
          </Link>
          {end}
        </p>
      </form>
    </AuthCard>
  );
}
