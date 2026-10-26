import { pathFor } from "@mcet/i18n";
import { AUTH_NAME_ALLOWED, AUTH_NAME_MAX, AuthName, EmailField } from "@mcet/schemas";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AuthCard, GoogleButton } from "~/components/auth";
import { Alert, Button, Field } from "~/components/ui";
import { errorText, postJson } from "~/lib/api-client";
import { fmt, useRoot } from "~/lib/i18n";
import { metaFor } from "~/lib/seo";
import type { Route } from "./+types/sign-up";

export const meta = (args: Route.MetaArgs) => metaFor(args, (t) => ({ title: t.auth.signUp.seoTitle }));

export default function SignUp() {
  const { site, t } = useRoot();
  const s = t.auth.signUp;
  const f = t.auth.fields;
  const [params] = useSearchParams();
  const plan = params.get("plan");
  const callbackURL = `${pathFor("dashboard", site.lang)}${plan === "personal" || plan === "branches" ? `?plan=${plan}` : ""}`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmPassword") ?? "");
    setPasswordError(null);

    const parsedName = AuthName.safeParse(name);
    if (!parsedName.success) {
      setNameError(t.auth.errors.invalid_name_characters);
      return;
    }
    if (!EmailField.safeParse(email).success) {
      setError(t.auth.errors.invalid_format);
      return;
    }
    if (!password || password.length < 12) {
      setError(t.auth.errors.password_too_short);
      return;
    }
    if (password.length > 128) {
      setError(t.auth.errors.password_too_long);
      return;
    }
    // biome-ignore lint/suspicious/noControlCharactersInRegex: validación de caracteres de control
    if (/[\u0000-\u001f\u007f-\u009f]/.test(password)) {
      setError(t.auth.errors.validation_failed);
      return;
    }

    if (password !== confirmation) {
      setError(null);
      setPasswordError(s.passwordMismatch);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await postJson("/api/auth/sign-up/email", {
        name: parsedName.data,
        email,
        password,
        callbackURL,
        locale: site.lang,
      });
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
      <form method="post" onSubmit={onSubmit} className="space-y-5">
        <Field
          label={f.name}
          name="name"
          autoComplete="name"
          required
          minLength={1}
          maxLength={AUTH_NAME_MAX}
          pattern="[\p{L}\p{M}](?:[\p{L}\p{M} '’ .\-]*[\p{L}\p{M}.])?"
          error={nameError ?? undefined}
          onInput={(event) => {
            const input = event.currentTarget;
            const filtered = input.value.replace(AUTH_NAME_ALLOWED, "");
            setNameError(filtered !== input.value ? t.auth.errors.invalid_name_characters : null);
            input.value = filtered;
          }}
        />
        <Field
          label={f.email}
          name="email"
          type="email"
          autoComplete="email"
          required
          minLength={5}
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
        <Field
          label={f.confirmPassword}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          error={passwordError ?? undefined}
          onChange={() => setPasswordError(null)}
        />
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
