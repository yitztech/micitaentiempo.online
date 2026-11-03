import { pathFor } from "@mcet/i18n";
import { AUTH_NAME_MAX } from "@mcet/schemas";
import { Database, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useRevalidator } from "react-router";
import { Dialog } from "~/components/dialog";
import { Select } from "~/components/select";
import { TwoFactorSection } from "~/components/two-factor";
import { Alert, Badge, Button, Card, Field, Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui";
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
  const [{ data: me }, { data: org }] = await Promise.all([
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
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">{a.title}</h1>
      </div>

      {msg ? <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert> : null}

      <Card className="p-5 sm:p-8">
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="mb-6 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <TabsTrigger value="profile">
              <UserRound aria-hidden className="size-4 shrink-0" />
              <span>{a.profile}</span>
            </TabsTrigger>
            <TabsTrigger value="password">
              <KeyRound aria-hidden className="size-4 shrink-0" />
              <span>{a.password}</span>
            </TabsTrigger>
            <TabsTrigger value="twoFactor">
              <ShieldCheck aria-hidden className="size-4 shrink-0" />
              <span className="truncate">{a.twoFactor.title}</span>
              {me.twoFactorEnabled ? <Badge className="ml-1 px-1.5 py-0 text-[10px]">✓</Badge> : null}
            </TabsTrigger>
            <TabsTrigger value="data">
              <Database aria-hidden className="size-4 shrink-0" />
              <span>{a.data}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-0 space-y-6">
            <div className="border-b border-border/80 pb-4">
              <h2 className="font-display text-lg font-semibold text-text">{a.profile}</h2>
            </div>
            <form method="post" onSubmit={onProfile} className="space-y-4">
              <Field
                label={a.name}
                name="name"
                defaultValue={me.name}
                required
                minLength={1}
                maxLength={AUTH_NAME_MAX}
                pattern="[\p{L}\p{M}](?:[\p{L}\p{M} '’ .\-]*[\p{L}\p{M}.])?"
                autoComplete="name"
              />
              <Field
                label={t.auth.fields.email}
                name="email"
                type="email"
                value={me.email}
                readOnly
                minLength={5}
                maxLength={254}
              />
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
              <div className="pt-2">
                <Button type="submit" loading={busy === "profile"}>
                  {a.save}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="password" className="mt-0 space-y-6">
            <div className="border-b border-border/80 pb-4">
              <h2 className="font-display text-lg font-semibold text-text">{a.password}</h2>
              <p className="mt-1 text-sm text-muted">{a.newPasswordHint}</p>
            </div>
            <form method="post" onSubmit={onPassword} className="space-y-4">
              <Field
                label={a.currentPassword}
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
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
              <div className="pt-2">
                <Button type="submit" loading={busy === "password"}>
                  {a.changePassword}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="twoFactor" className="mt-0 space-y-6">
            <div className="border-b border-border/80 pb-4">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-text">
                {a.twoFactor.title}
                {me.twoFactorEnabled ? <Badge>✓</Badge> : null}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {me.twoFactorEnabled ? a.twoFactor.on : a.twoFactor.off}
              </p>
            </div>
            <TwoFactorSection
              enabled={me.twoFactorEnabled}
              onChange={() => void revalidator.revalidate()}
              embedded
            />
          </TabsContent>

          <TabsContent value="data" className="mt-0 space-y-6">
            <div className="border-b border-border/80 pb-4">
              <h2 className="font-display text-lg font-semibold text-text">{a.data}</h2>
              <p className="mt-1 text-sm text-muted">{a.exportLead}</p>
            </div>
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-text">{a.export}</h3>
                <p className="mt-1 text-sm text-muted">{a.exportLead}</p>
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
                  <h3 className="font-semibold text-text">{a.closeTitle}</h3>
                  <p className="mt-1 text-sm text-muted">{a.closeLead}</p>
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
                <h3 className="font-semibold text-text">{a.deleteTitle}</h3>
                <p className="mt-1 text-sm text-muted">{a.deleteLead}</p>
                <Button
                  variant="danger"
                  className="mt-3"
                  loading={busy === "delete"}
                  onClick={() => setDeleting(true)}
                >
                  {a.delete}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </Card>

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
