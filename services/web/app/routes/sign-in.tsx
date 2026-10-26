import { pathFor } from "@mcet/i18n";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AuthCard, GoogleButton } from "~/components/auth";
import { Alert, Button, Checkbox, Field } from "~/components/ui";
import { type ApiError, errorText, postJson, safeNext } from "~/lib/api-client";
import { useRoot } from "~/lib/i18n";
import { type OAuthRedirect, oauthNext, signedOAuthQuery } from "~/lib/oauth";
import { metaFor } from "~/lib/seo";
import type { Route } from "./+types/sign-in";

export const meta = (args: Route.MetaArgs) => metaFor(args, (t) => ({ title: t.auth.signIn.seoTitle }));

export default function SignIn() {
  const { site, t } = useRoot();
  const s = t.auth.signIn;
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"), pathFor("dashboard", site.lang));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; tone: "danger" | "warning" } | null>(null);
  // Segundo paso: código de la app de autenticación (o de respaldo) si la cuenta lo tiene activado.
  const [twoFactor, setTwoFactor] = useState<null | "totp" | "backup">(null);

  function finish(res: OAuthRedirect | null, oauthQuery: string | undefined) {
    window.location.assign((oauthQuery && oauthNext(res)) || next);
  }

  async function onTwoFactor(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const code = String(form.get("code") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const oauthQuery = signedOAuthQuery(window.location.search);
      const res = await postJson<OAuthRedirect>(
        twoFactor === "backup"
          ? "/api/auth/two-factor/verify-backup-code"
          : "/api/auth/two-factor/verify-totp",
        {
          code,
          trustDevice: form.get("trust") === "on",
          ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
        },
      );
      finish(res, oauthQuery);
    } catch (err) {
      setError({ text: errorText(t.auth.errors, err), tone: "danger" });
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    // Validaciones de formato, longitud y caracteres
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!email || email.length < 5 || email.length > 254 || !emailRegex.test(email)) {
      setError({ text: t.auth.errors.invalid_format, tone: "danger" });
      return;
    }
    if (!password || password.length < 8) {
      setError({ text: t.auth.errors.password_too_short, tone: "danger" });
      return;
    }
    if (password.length > 128) {
      setError({ text: t.auth.errors.password_too_long, tone: "danger" });
      return;
    }
    // biome-ignore lint/suspicious/noControlCharactersInRegex: validación de caracteres de control
    if (/[\u0000-\u001f\u007f-\u009f]/.test(password)) {
      setError({ text: t.auth.errors.validation_failed, tone: "danger" });
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Si la entrada viene de conectar una aplicación de IA, el servidor devuelve dónde seguir.
      const oauthQuery = signedOAuthQuery(window.location.search);
      const res = await postJson<OAuthRedirect & { twoFactorRedirect?: boolean }>("/api/auth/sign-in/email", {
        email,
        password,
        ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
      });
      if (res?.twoFactorRedirect) {
        setTwoFactor("totp");
        setBusy(false);
        return;
      }
      finish(res, oauthQuery);
    } catch (err) {
      if ((err as ApiError).code === "email_not_verified") {
        await postJson("/api/auth/send-verification-email", { email, callbackURL: next }).catch(
          () => undefined,
        );
        setError({ text: s.unverified, tone: "warning" });
      } else {
        setError({ text: errorText(t.auth.errors, err), tone: "danger" });
      }
      setBusy(false);
    }
  }

  if (twoFactor) {
    return (
      <AuthCard title={s.twoFactorTitle} lead={s.twoFactorLead}>
        <form method="post" onSubmit={onTwoFactor} className="space-y-5" key={twoFactor}>
          <Field
            label={twoFactor === "backup" ? s.twoFactorBackupCode : s.twoFactorCode}
            name="code"
            autoComplete="one-time-code"
            {...(twoFactor === "totp"
              ? { inputMode: "numeric" as const, pattern: "\\d{6}", maxLength: 6 }
              : {})}
            required
          />
          <Checkbox label={s.twoFactorTrust} name="trust" />
          {error ? <Alert tone={error.tone}>{error.text}</Alert> : null}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {s.twoFactorSubmit}
          </Button>
          <button
            type="button"
            className="min-h-11 text-[15px] text-primary underline underline-offset-2"
            onClick={() => {
              setError(null);
              setTwoFactor(twoFactor === "totp" ? "backup" : "totp");
            }}
          >
            {twoFactor === "totp" ? s.twoFactorBackup : s.twoFactorApp}
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={s.title}
      lead={s.lead}
      footer={
        <div className="space-y-2">
          <div>
            {s.noAccount}{" "}
            <Link
              to={pathFor("signUp", site.lang)}
              className="font-medium text-primary underline underline-offset-2"
            >
              {t.common.nav.signUp}
            </Link>
          </div>
          <div className="border-t border-border pt-2 text-sm text-muted">
            <Link
              to={pathFor("myAppointments", site.lang)}
              className="text-muted hover:text-primary underline underline-offset-2"
            >
              {t.common.nav.myAppointments}
            </Link>
          </div>
        </div>
      }
    >
      <GoogleButton callbackURL={next} />
      <form method="post" onSubmit={onSubmit} className="space-y-5">
        <Field
          label={t.auth.fields.email}
          name="email"
          type="email"
          autoComplete="email"
          required
          minLength={5}
          maxLength={254}
          pattern="[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
        />
        <Field
          label={t.auth.fields.password}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          maxLength={128}
        />
        <div className="-mt-2 text-right">
          <Link
            to={pathFor("forgotPassword", site.lang)}
            className="inline-flex min-h-11 items-center text-[15px] text-primary underline underline-offset-2"
          >
            {s.forgot}
          </Link>
        </div>
        {error ? <Alert tone={error.tone}>{error.text}</Alert> : null}
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          {s.submit}
        </Button>
      </form>
    </AuthCard>
  );
}
