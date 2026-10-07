import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAltcha } from "~/lib/altcha";
import { errorText, postJson } from "~/lib/api-client";
import { setCustomerSession } from "~/lib/customer";
import { fmt, useT } from "~/lib/i18n";
import { AltchaStatus } from "./altcha-status";
import { Alert, Button, Field } from "./ui";

/**
 * Verificación del cliente final por código de 6 dígitos. Si `email` viene dado (flujo de reserva) se
 * envía el código al montar; si no, primero se pide el correo («Mis citas»).
 */
export function OtpForm({
  email: given,
  name,
  autoSend,
  submitLabel,
  onVerified,
}: {
  email?: string;
  name?: string;
  autoSend?: boolean;
  submitLabel: string;
  onVerified: (session: { token: string; email: string }) => void | Promise<void>;
}) {
  const t = useT();
  const b = t.booking;
  const altcha = useAltcha();
  const [email, setEmail] = useState(given ?? "");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(to: string) {
    setBusy(true);
    setError(null);
    try {
      const token = await altcha.token();
      await postJson("/api/public/v1/otp/send", { email: to }, { "x-altcha": token });
      setSent(true);
    } catch (err) {
      setError(errorText(b.errors, err));
    } finally {
      setBusy(false);
    }
  }

  const once = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: se envía una sola vez al montar
  useEffect(() => {
    if (autoSend && given && !once.current) {
      once.current = true;
      void send(given);
    }
  }, []);

  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const res = await postJson<{ token: string }>("/api/public/v1/otp/verify", {
        email,
        code,
        ...(name ? { name } : {}),
      });
      const session = { token: res.token, email };
      setCustomerSession(session);
      await onVerified(session);
    } catch (err) {
      setError(errorText(b.errors, err));
      setBusy(false);
    }
  }

  if (!sent) {
    return (
      <form
        method="post"
        onSubmit={(e) => {
          e.preventDefault();
          void send(email.trim());
        }}
        onFocus={() => void altcha.start().catch(() => undefined)}
        className="space-y-4"
      >
        {given ? null : (
          <Field
            label={b.details.email}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
        <AltchaStatus state={altcha.state} onRetry={() => void altcha.start().catch(() => undefined)} />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          {b.my.sendCode}
        </Button>
      </form>
    );
  }
  return (
    <form method="post" onSubmit={verify} className="space-y-4">
      <Alert tone="info">{fmt(b.verify.sent, { email })}</Alert>
      <Field
        label={b.verify.code}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
        className="max-w-48"
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        {submitLabel}
      </Button>
      <button
        type="button"
        className="min-h-11 text-[15px] text-primary underline underline-offset-2"
        onClick={() => void send(email)}
      >
        {b.verify.resend}
      </button>
    </form>
  );
}
