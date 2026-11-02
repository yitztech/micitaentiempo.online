import { EmailField } from "@mcet/schemas";
import { type FormEvent, useState } from "react";
import { AltchaStatus } from "~/components/altcha-status";
import { Alert, Button, Checkbox, Container, Field, TextArea } from "~/components/ui";
import { useAltcha } from "~/lib/altcha";
import { errorText, postJson } from "~/lib/api-client";
import { useRoot } from "~/lib/i18n";
import { metaFor, publicCacheHeaders } from "~/lib/seo";
import type { Route } from "./+types/contact";

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.public.contact.seoTitle, description: t.public.contact.seoDescription }));

export const headers = () => publicCacheHeaders;

export default function Contact() {
  const { site, t, features } = useRoot();
  const c = t.public.contact;
  const altcha = useAltcha();
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    setEmailError(null);
    if (!EmailField.safeParse(email).success) {
      setEmailError(t.auth.errors.invalid_format);
      return;
    }
    setStatus("sending");
    setError(null);
    try {
      const token = await altcha.token();
      await postJson(
        "/api/public/v1/contact",
        {
          name: String(form.get("name") ?? ""),
          email,
          message: String(form.get("message") ?? ""),
          newsletter: form.get("newsletter") === "on",
        },
        { "x-altcha": token },
      );
      setStatus("sent");
    } catch (err) {
      setStatus("idle");
      setError(errorText({ ...t.auth.errors, generic: c.failed }, err));
    }
  }

  return (
    <Container width="form" className="py-14 sm:py-20">
      <h1 className="text-4xl font-semibold tracking-tight">{c.title}</h1>
      <p className="mt-4 text-lg text-muted">{c.lead}</p>
      {status === "sent" ? (
        <Alert tone="success" className="mt-8">
          {c.sent}
        </Alert>
      ) : (
        <form
          method="post"
          onSubmit={onSubmit}
          onFocus={() => void altcha.start().catch(() => undefined)}
          className="mt-8 space-y-5"
          noValidate={false}
        >
          <Field label={c.name} name="name" autoComplete="name" required maxLength={120} />
          <Field
            label={c.email}
            name="email"
            type="email"
            autoComplete="email"
            required
            minLength={5}
            maxLength={254}
            error={emailError ?? undefined}
            onInput={() => setEmailError(null)}
            onBlur={(e) => {
              const val = e.currentTarget.value.trim();
              if (val && !EmailField.safeParse(val).success) {
                setEmailError(t.auth.errors.invalid_format);
              }
            }}
          />
          <TextArea label={c.message} name="message" required minLength={10} maxLength={4000} />
          {features.newsletter[site.lang] ? <Checkbox name="newsletter" label={c.newsletter} /> : null}
          <AltchaStatus state={altcha.state} onRetry={() => void altcha.start().catch(() => undefined)} />
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" size="lg" loading={status === "sending"}>
            {status === "sending" ? t.common.ui.sending : c.submit}
          </Button>
        </form>
      )}
    </Container>
  );
}
