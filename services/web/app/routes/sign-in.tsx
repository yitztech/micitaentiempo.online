import { pathFor } from "@mcet/i18n";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AuthCard, GoogleButton } from "~/components/auth";
import { Alert, Button, Field } from "~/components/ui";
import { type ApiError, errorText, postJson, safeNext } from "~/lib/api-client";
import { useRoot } from "~/lib/i18n";
import { type OAuthRedirect, oauthNext, signedOAuthQuery } from "~/lib/oauth";
import { metaFor } from "~/lib/seo";
import type { Route } from "./+types/sign-in";

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.auth.signIn.seoTitle, indexable: false }));

export default function SignIn() {
  const { site, t } = useRoot();
  const s = t.auth.signIn;
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"), pathFor("dashboard", site.lang));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; tone: "danger" | "warning" } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      // Si la entrada viene de conectar una aplicación de IA, el servidor devuelve dónde seguir.
      const oauthQuery = signedOAuthQuery(window.location.search);
      const res = await postJson<OAuthRedirect>("/api/auth/sign-in/email", {
        email,
        password: String(form.get("password") ?? ""),
        ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
      });
      window.location.assign((oauthQuery && oauthNext(res)) || next);
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

  return (
    <AuthCard
      title={s.title}
      lead={s.lead}
      footer={
        <>
          {s.noAccount}{" "}
          <Link
            to={pathFor("signUp", site.lang)}
            className="font-medium text-primary underline underline-offset-2"
          >
            {t.common.nav.signUp}
          </Link>
        </>
      }
    >
      <GoogleButton callbackURL={next} />
      <form method="post" onSubmit={onSubmit} className="space-y-5">
        <Field label={t.auth.fields.email} name="email" type="email" autoComplete="email" required />
        <Field
          label={t.auth.fields.password}
          name="password"
          type="password"
          autoComplete="current-password"
          required
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
