import { pathFor } from "@mcet/i18n";
import { type FormEvent, useState } from "react";
import { useRevalidator } from "react-router";
import { Dialog } from "~/components/dialog";
import { Select } from "~/components/select";
import { TwoFactorSection } from "~/components/two-factor";
import { Alert, Button, Card, Field } from "~/components/ui";
import { type ApiError, apiRequest, errorText, postJson } from "~/lib/api-client";
import { fmt, useRoot } from "~/lib/i18n";
import { panelGet, panelGetOptional } from "~/lib/panel.server";
import { metaFor } from "~/lib/seo";
import { allTimeZones } from "~/lib/time";
import type { Route } from "./+types/account";

interface MeFull {
  id: string;
  name: string;
  email: string;
  locale: "es" | "en";
  timezone: string;
  timeFormat: "12h" | "24h";
  weekStart: 1 | 7;
  twoFactorEnabled: boolean;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const [me, org] = await Promise.all([
    panelGet<MeFull>(request, context, "/api/v1/me"),
    panelGetOptional<{ id: string; name: string }>(request, context, "/api/v1/org"),
  ]);
  return { me, org };
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.panel.account.seoTitle, indexable: false }));

/** Panel → Cuenta: perfil, contraseña, exportación y borrado de la cuenta (RNF-06). */
export default function AccountPage({ loaderData }: Route.ComponentProps) {
  const { site, t } = useRoot();
  const a = t.panel.account;
  const { me, org } = loaderData;
  const [closing, setClosing] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const revalidator = useRevalidator();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmWord, setConfirmWord] = useState("");

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ ok: true, text: ok });
      void revalidator.revalidate();
    } catch (err) {
      const code = (err as ApiError).code;
      setMsg({ ok: false, text: code === "owner_has_org" ? a.ownerHasOrg : errorText(t.panel.errors, err) });
    } finally {
      setBusy(null);
    }
  }

  function onProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(
      "profile",
      () =>
        apiRequest("PATCH", "/api/v1/me", {
          name: String(f.get("name") ?? "").trim(),
          locale: f.get("locale"),
          timezone: f.get("timezone"),
          timeFormat: f.get("timeFormat"),
          weekStart: Number(f.get("weekStart")),
        }),
      a.saved,
    );
  }

  function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    void run(
      "password",
      async () => {
        await postJson("/api/auth/change-password", {
          currentPassword: String(f.get("currentPassword") ?? ""),
          newPassword: String(f.get("newPassword") ?? ""),
          revokeOtherSessions: true,
        });
        form.reset();
      },
      a.passwordChanged,
    );
  }

  async function onExport() {
    await run("export", async () => {
      const data = await apiRequest<unknown>("GET", "/api/v1/me/export");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `mis-datos-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  async function onClose() {
    setClosing(false);
    await run("close", () => apiRequest("DELETE", "/api/v1/org", { confirmName }), a.closed);
  }

  async function onDelete() {
    setDeleting(false);
    await run("delete", async () => {
      await apiRequest("DELETE", "/api/v1/me");
      window.location.assign(pathFor("home", site.lang));
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="font-display text-3xl font-semibold">{a.title}</h1>
      {msg ? <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert> : null}

      <section aria-labelledby="cuenta-perfil">
        <h2 id="cuenta-perfil" className="mb-3 text-xl font-semibold">
          {a.profile}
        </h2>
        <Card>
          <form method="post" onSubmit={onProfile} className="space-y-4">
            <Field
              label={a.name}
              name="name"
              defaultValue={me.name}
              required
              maxLength={120}
              autoComplete="name"
            />
            <Field label={t.auth.fields.email} name="email" value={me.email} readOnly />
            <Select label={a.language} name="locale" defaultValue={me.locale}>
              <option value="es">{a.languages.es}</option>
              <option value="en">{a.languages.en}</option>
            </Select>
            <Select label={a.timezone} name="timezone" defaultValue={me.timezone}>
              {allTimeZones().map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
            <Select label={a.timeFormat} name="timeFormat" defaultValue={me.timeFormat}>
              <option value="24h">{a.timeFormats["24h"]}</option>
              <option value="12h">{a.timeFormats["12h"]}</option>
            </Select>
            <Select label={a.weekStart} name="weekStart" defaultValue={String(me.weekStart)}>
              <option value="1">{a.weekStarts["1"]}</option>
              <option value="7">{a.weekStarts["7"]}</option>
            </Select>
            <Button type="submit" loading={busy === "profile"}>
              {a.save}
            </Button>
          </form>
        </Card>
      </section>

      <section aria-labelledby="cuenta-clave">
        <h2 id="cuenta-clave" className="mb-3 text-xl font-semibold">
          {a.password}
        </h2>
        <Card>
          <form method="post" onSubmit={onPassword} className="space-y-4">
            <Field
              label={a.currentPassword}
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
            <Field
              label={a.newPassword}
              hint={a.newPasswordHint}
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
            <Button type="submit" loading={busy === "password"}>
              {a.changePassword}
            </Button>
          </form>
        </Card>
      </section>

      <TwoFactorSection enabled={me.twoFactorEnabled} onChange={() => void revalidator.revalidate()} />

      <section aria-labelledby="cuenta-datos">
        <h2 id="cuenta-datos" className="mb-3 text-xl font-semibold">
          {a.data}
        </h2>
        <Card className="space-y-6">
          <div>
            <p className="text-muted">{a.exportLead}</p>
            <Button
              variant="secondary"
              className="mt-3"
              loading={busy === "export"}
              onClick={() => void onExport()}
            >
              {a.export}
            </Button>
          </div>
          {org ? (
            <div className="border-t border-border pt-6">
              <h3 className="font-semibold">{a.closeTitle}</h3>
              <p className="mt-1 text-muted">{a.closeLead}</p>
              <Button
                variant="danger"
                className="mt-3"
                loading={busy === "close"}
                onClick={() => setClosing(true)}
              >
                {a.close}
              </Button>
            </div>
          ) : null}
          <div className="border-t border-border pt-6">
            <h3 className="font-semibold">{a.deleteTitle}</h3>
            <p className="mt-1 text-muted">{a.deleteLead}</p>
            <Button
              variant="danger"
              className="mt-3"
              loading={busy === "delete"}
              onClick={() => setDeleting(true)}
            >
              {a.delete}
            </Button>
          </div>
        </Card>
      </section>

      <Dialog open={closing} onClose={() => setClosing(false)} title={a.closeTitle}>
        <p>{fmt(a.closeConfirm, { name: org?.name ?? "" })}</p>
        <Field
          label={a.closeName}
          name="confirmName"
          value={confirmName}
          onChange={(e) => setConfirmName(e.currentTarget.value)}
          className="mt-3"
          autoComplete="off"
        />
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setClosing(false)}>
            {a.keep}
          </Button>
          <Button
            variant="danger"
            disabled={confirmName.trim() !== (org?.name ?? "").trim()}
            onClick={() => void onClose()}
          >
            {a.close}
          </Button>
        </div>
      </Dialog>

      <Dialog open={deleting} onClose={() => setDeleting(false)} title={a.deleteTitle}>
        <p>{a.deleteConfirm}</p>
        <Field
          label={a.deleteWord}
          name="confirm"
          value={confirmWord}
          onChange={(e) => setConfirmWord(e.currentTarget.value)}
          className="mt-3"
          autoComplete="off"
        />
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleting(false)}>
            {a.keep}
          </Button>
          <Button variant="danger" disabled={confirmWord !== a.deleteWord} onClick={() => void onDelete()}>
            {a.delete}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
