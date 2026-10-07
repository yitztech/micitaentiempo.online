import { type FormEvent, useState } from "react";
import { renderSVG } from "uqr";
import { errorText, postJson } from "~/lib/api-client";
import { useRoot } from "~/lib/i18n";
import { Alert, Badge, Button, Card, Field } from "./ui";

type Step = "idle" | "enable" | "disable" | "setup" | "backup";

/**
 * Verificación en dos pasos con app de autenticación (TOTP, plugin twoFactor de Better Auth): activar con
 * QR y códigos de respaldo, confirmar con un código y desactivar con la contraseña.
 */
export function TwoFactorSection({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  const { t } = useRoot();
  const s = t.panel.account.twoFactor;
  const [step, setStep] = useState<Step>("idle");
  const [setup, setSetup] = useState<{ uri: string; backupCodes: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      setMsg({ ok: false, text: errorText(t.auth.errors, err) });
    } finally {
      setBusy(false);
    }
  }

  const password = (e: FormEvent<HTMLFormElement>) =>
    String(new FormData(e.currentTarget).get("password") ?? "");

  function onEnable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pass = password(e);
    void run(async () => {
      const res = await postJson<{ totpURI: string; backupCodes: string[] }>("/api/auth/two-factor/enable", {
        password: pass,
      });
      setSetup({ uri: res.totpURI, backupCodes: res.backupCodes });
      setStep("setup");
    });
  }

  function onConfirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "").trim();
    void run(async () => {
      await postJson("/api/auth/two-factor/verify-totp", { code });
      setStep("backup");
      setMsg({ ok: true, text: s.enabled });
      onChange();
    });
  }

  function onDisable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pass = password(e);
    void run(async () => {
      await postJson("/api/auth/two-factor/disable", { password: pass });
      setStep("idle");
      setSetup(null);
      setMsg({ ok: true, text: s.disabled });
      onChange();
    });
  }

  const secret = setup ? (new URL(setup.uri).searchParams.get("secret") ?? "") : "";
  const passwordForm = (onSubmit: (e: FormEvent<HTMLFormElement>) => void, label: string) => (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      <Field label={s.password} name="password" type="password" autoComplete="current-password" required />
      <div className="flex gap-3">
        <Button type="submit" loading={busy} variant={step === "disable" ? "danger" : "primary"}>
          {label}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setStep("idle")}>
          {s.cancel}
        </Button>
      </div>
    </form>
  );

  return (
    <section aria-labelledby="cuenta-2fa">
      <h2 id="cuenta-2fa" className="mb-3 flex items-center gap-2 text-xl font-semibold">
        {s.title}
        {enabled ? <Badge>✓</Badge> : null}
      </h2>
      <Card className="space-y-4">
        <p className="text-muted">{enabled ? s.on : s.off}</p>
        {msg ? <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert> : null}

        {step === "idle" ? (
          enabled ? (
            <Button variant="secondary" onClick={() => setStep("disable")}>
              {s.disable}
            </Button>
          ) : (
            <Button onClick={() => setStep("enable")}>{s.enable}</Button>
          )
        ) : null}

        {step === "enable" ? passwordForm(onEnable, s.enable) : null}
        {step === "disable" ? passwordForm(onDisable, s.disable) : null}

        {step === "setup" && setup ? (
          <div className="space-y-4">
            <p>{s.scan}</p>
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(setup.uri))}`}
              alt=""
              width={192}
              height={192}
              className="rounded-[var(--radius-field)] bg-white p-2"
            />
            <code className="block break-all rounded-[var(--radius-field)] bg-surface-2 px-3 py-2 font-mono text-sm">
              {secret}
            </code>
            <form method="post" onSubmit={onConfirm} className="space-y-4">
              <Field
                label={s.code}
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                className="max-w-48"
              />
              <Button type="submit" loading={busy}>
                {s.confirm}
              </Button>
            </form>
          </div>
        ) : null}

        {step === "backup" && setup ? (
          <div className="space-y-3">
            <Alert tone="warning">{s.backup}</Alert>
            <ul className="grid grid-cols-2 gap-2 font-mono text-sm" aria-label={s.backup}>
              {setup.backupCodes.map((c) => (
                <li key={c} className="rounded bg-surface-2 px-2 py-1">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
