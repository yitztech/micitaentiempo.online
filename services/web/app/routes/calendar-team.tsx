import { type FormEvent, useState } from "react";
import { useRevalidator } from "react-router";
import { Select } from "~/components/select";
import { Alert, Button, Card, Field } from "~/components/ui";
import { apiRequest, errorText } from "~/lib/api-client";
import { fmt, useRoot } from "~/lib/i18n";
import { panelGet } from "~/lib/panel.server";
import type { BoardView, Role } from "~/lib/panel-types";
import { metaFor } from "~/lib/seo";
import { usePanel } from "./_panel";
import type { Route } from "./+types/calendar-team";

interface Members {
  members: Array<{ userId: string; role: Role; name: string; email: string }>;
  pending: Array<{ id: string; email: string; role: "editor" | "observer"; expiresAt: string }>;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const id = params.id ?? "";
  const [board, members] = await Promise.all([
    panelGet<BoardView>(request, context, `/api/v1/calendars/${id}`),
    panelGet<Members>(request, context, `/api/v1/calendars/${id}/members`),
  ]);
  return { board, members };
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.panel.team.seoTitle, indexable: false }));

/** Equipo del tablero: invitar editores u observadores y quitar accesos (solo propietario). */
export default function CalendarTeam({ loaderData }: Route.ComponentProps) {
  const { t } = useRoot();
  const tm = t.panel.team;
  const { me } = usePanel();
  const { board, members } = loaderData;
  const revalidator = useRevalidator();
  const [role, setRole] = useState<"editor" | "observer">("observer");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const owner = board.role === "owner";

  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = String(new FormData(form).get("email") ?? "").trim();
    setBusy(true);
    try {
      await apiRequest("POST", `/api/v1/calendars/${board.id}/invitations`, { email, role });
      setMsg({ ok: true, text: fmt(tm.invited, { email }) });
      form.reset();
      void revalidator.revalidate();
    } catch (err) {
      setMsg({ ok: false, text: errorText(t.panel.errors, err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(path: string) {
    try {
      await apiRequest("DELETE", path);
      void revalidator.revalidate();
    } catch (err) {
      setMsg({ ok: false, text: errorText(t.panel.errors, err) });
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {board.name} · {tm.title}
      </h1>
      {owner ? (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">{tm.invite}</h2>
          <form
            method="post"
            onSubmit={invite}
            className="mt-4 grid gap-4 sm:grid-cols-[1fr_14rem_auto] sm:items-end"
          >
            <Field label={tm.email} name="email" type="email" required autoComplete="off" />
            <Select label={tm.role} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              <option value="observer">{tm.roles.observer}</option>
              <option value="editor">{tm.roles.editor}</option>
            </Select>
            <Button type="submit" loading={busy}>
              {tm.invite}
            </Button>
          </form>
          <p className="mt-2 text-sm text-muted">{tm.roleHints[role]}</p>
          {msg ? (
            <Alert tone={msg.ok ? "success" : "danger"} className="mt-4">
              {msg.text}
            </Alert>
          ) : null}
        </Card>
      ) : null}
      <Card className="p-6">
        <h2 className="text-lg font-semibold">{tm.members}</h2>
        <ul className="mt-4 divide-y divide-border">
          {members.members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">
                  {m.name || m.email}{" "}
                  {m.userId === me.id ? <span className="text-muted">{tm.you}</span> : null}
                </p>
                <p className="text-sm text-muted">
                  {m.email} · {tm.roles[m.role]}
                </p>
              </div>
              {owner && m.role !== "owner" ? (
                <Button
                  variant="ghost"
                  className="text-danger"
                  onClick={() => void remove(`/api/v1/calendars/${board.id}/members/${m.userId}`)}
                >
                  {tm.remove}
                </Button>
              ) : null}
            </li>
          ))}
          {members.pending.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{p.email}</p>
                <p className="text-sm text-muted">
                  {tm.roles[p.role]} · {tm.pending}
                </p>
              </div>
              {owner ? (
                <Button
                  variant="ghost"
                  className="text-danger"
                  onClick={() => void remove(`/api/v1/calendars/${board.id}/invitations/${p.id}`)}
                >
                  {tm.remove}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
