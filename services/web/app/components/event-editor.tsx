import { type FormEvent, useEffect, useState } from "react";
import { type ApiError, apiRequest, errorText } from "~/lib/api-client";
import { useRoot } from "~/lib/i18n";
import type { EventView, ServiceView } from "~/lib/panel-types";
import { buildRRule, type Ends, parseRRule, type Recurrence, type Repeat } from "~/lib/rrule";
import { formatDateTime } from "~/lib/time";
import { instantToWall, wallToInstant, weekdayOf } from "~/lib/wall";
import { Dialog } from "./dialog";
import { Select } from "./select";
import { Alert, Button, Checkbox, Field, TextArea } from "./ui";

export interface EditorTarget {
  mode: "create" | "edit";
  kind: "appointment" | "block";
  start?: string;
  end?: string;
  event?: EventView;
}

type Scope = "this" | "following" | "all";

/** Crear y editar citas y bloqueos del panel, con recurrencia, alcance y conflictos. */
export function EventEditor({
  calendarId,
  tz,
  services,
  canWrite,
  target,
  onClose,
  onSaved,
}: {
  calendarId: string;
  tz: string;
  services: ServiceView[];
  canWrite: boolean;
  target: EditorTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { site, t } = useRoot();
  const e = t.panel.editor;
  const ev = target?.event;
  const [kind, setKind] = useState<"appointment" | "block">("appointment");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [title, setTitle] = useState("");
  const [attendee, setAttendee] = useState({ name: "", email: "", phone: "" });
  const [notes, setNotes] = useState("");
  const [rec, setRec] = useState<Recurrence>(parseRRule(null));
  const [scope, setScope] = useState<Scope>("this");
  const [cancelOverlapping, setCancelOverlapping] = useState(false);
  const [conflicts, setConflicts] = useState<Array<{
    start: string;
    reason: "seat_unavailable" | "blocked";
  }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!target) return;
    const s = instantToWall(target.start ?? ev?.start ?? new Date().toISOString(), tz);
    const en = instantToWall(target.end ?? ev?.end ?? new Date(Date.now() + 3_600_000).toISOString(), tz);
    setKind(target.kind);
    setServiceId(
      ev
        ? (ev.serviceId ?? "")
        : target.kind === "appointment"
          ? (services.find((x) => x.active)?.id ?? "")
          : "",
    );
    setDate(s.date);
    setStart(s.time);
    setEnd(en.time);
    setTitle(ev?.title ?? "");
    setAttendee({
      name: ev?.attendee?.name ?? "",
      email: ev?.attendee?.email ?? "",
      phone: ev?.attendee?.phone ?? "",
    });
    setNotes(ev?.internalNotes ?? "");
    setRec(parseRRule(ev?.recurrence?.rrule));
    setScope("this");
    setConflicts(null);
    setError(null);
    setConfirmCancel(false);
    setReason("");
    setCancelOverlapping(false);
  }, [target, ev, tz, services]);

  if (!target) return null;
  const isSeries = Boolean(ev?.recurrence);
  const service = services.find((s) => s.id === serviceId);
  const needsEnd = kind === "block" || !service;
  const svcName = (s: ServiceView) => s.name[site.lang] || Object.values(s.name)[0] || "";
  const startIso = date ? wallToInstant(date, start, tz) : "";
  const endIso = date && needsEnd ? wallToInstant(date, end, tz) : undefined;
  const rrule = date ? buildRRule(rec, date, tz) : "";
  const fail = (err: unknown) => setError(errorText(t.panel.errors, err));

  async function save(onConflict: "abort" | "skip" = "abort") {
    setBusy(true);
    setError(null);
    try {
      const att =
        attendee.name || attendee.email
          ? {
              name: attendee.name || attendee.email,
              ...(attendee.email ? { email: attendee.email } : {}),
              ...(attendee.phone ? { phone: attendee.phone } : {}),
            }
          : undefined;
      if (target?.mode === "create") {
        await apiRequest("POST", `/api/v1/calendars/${calendarId}/events`, {
          kind,
          start: startIso,
          ...(endIso ? { end: endIso } : {}),
          ...(kind === "appointment" && serviceId ? { serviceId } : {}),
          ...(title ? { title } : {}),
          ...(kind === "appointment" && att ? { attendee: att } : {}),
          ...(notes ? { internalNotes: notes } : {}),
          ...(rrule ? { rrule, onConflict } : {}),
          ...(kind === "block" ? { cancelOverlapping } : {}),
        });
      } else if (ev) {
        const origRule = ev.recurrence?.rrule ?? "";
        await apiRequest("PATCH", `/api/v1/calendars/${calendarId}/events/${ev.id}`, {
          expectedVersion: ev.version,
          scope: isSeries ? scope : "this",
          start: startIso,
          end:
            endIso ??
            new Date(Date.parse(startIso) + (Date.parse(ev.end) - Date.parse(ev.start))).toISOString(),
          title,
          internalNotes: notes,
          ...(att ? { attendee: att } : {}),
          ...(isSeries && scope !== "this" && rrule && rrule !== origRule ? { rrule } : {}),
        });
      }
      onSaved();
    } catch (err) {
      const x = err as ApiError;
      if (x.code === "series_conflict" && Array.isArray(x.body?.conflicts))
        setConflicts(x.body.conflicts as typeof conflicts);
      else fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!ev) return;
    setBusy(true);
    try {
      await apiRequest("POST", `/api/v1/calendars/${calendarId}/events/${ev.id}/cancel`, {
        scope: isSeries ? scope : "this",
        reason,
        expectedVersion: isSeries && scope !== "this" ? 0 : ev.version,
      });
      onSaved();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function attendance(value: "attended" | "no_show" | "") {
    if (!ev) return;
    try {
      await apiRequest("POST", `/api/v1/calendars/${calendarId}/events/${ev.id}/attendance`, {
        attendance: value,
      });
      onSaved();
    } catch (err) {
      fail(err);
    }
  }

  const heading = target.mode === "create" ? (kind === "block" ? e.newBlockTitle : e.newTitle) : e.editTitle;
  const readOnly = !canWrite;
  const past = ev ? Date.parse(ev.start) <= Date.now() : false;
  const wd = date ? weekdayOf(date) : 1;

  return (
    <Dialog open onClose={onClose} title={heading}>
      <form
        onSubmit={(x: FormEvent) => {
          x.preventDefault();
          void save();
        }}
        className="space-y-4"
      >
        <fieldset disabled={readOnly || busy} className="space-y-4">
          {target.mode === "create" ? (
            <Select label={e.kind} value={kind} onChange={(x) => setKind(x.target.value as typeof kind)}>
              <option value="appointment">{e.kinds.appointment}</option>
              <option value="block">{e.kinds.block}</option>
            </Select>
          ) : ev ? (
            <p className="text-sm text-muted">
              {e.kinds[ev.kind]} · {e.status[ev.status]}
            </p>
          ) : null}
          {kind === "appointment" ? (
            <Select
              label={e.service}
              value={serviceId}
              onChange={(x) => setServiceId(x.target.value)}
              disabled={target.mode === "edit"}
            >
              <option value="">{e.noService}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {svcName(s)} · {s.durationMin} min
                </option>
              ))}
            </Select>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field
              label={e.date}
              type="date"
              required
              value={date}
              onChange={(x) => setDate(x.target.value)}
              className="col-span-2 sm:col-span-1"
            />
            <Field
              label={e.start}
              type="time"
              required
              value={start}
              onChange={(x) => setStart(x.target.value)}
            />
            {needsEnd ? (
              <Field
                label={e.end}
                type="time"
                required
                value={end}
                onChange={(x) => setEnd(x.target.value)}
              />
            ) : null}
          </div>
          <Field
            label={e.title}
            value={title}
            maxLength={200}
            onChange={(x) => setTitle(x.target.value)}
            optional
          />
          {kind === "appointment" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={e.attendeeName}
                value={attendee.name}
                maxLength={120}
                onChange={(x) => setAttendee({ ...attendee, name: x.target.value })}
                optional
              />
              <Field
                label={e.attendeeEmail}
                type="email"
                value={attendee.email}
                onChange={(x) => setAttendee({ ...attendee, email: x.target.value })}
                optional
              />
              <Field
                label={e.attendeePhone}
                type="tel"
                pattern="\+[1-9][0-9]{6,14}"
                value={attendee.phone}
                onChange={(x) => setAttendee({ ...attendee, phone: x.target.value })}
                optional
              />
            </div>
          ) : null}
          {ev?.customerNotes ? (
            <div>
              <p className="text-[15px] font-medium">{e.customerNotes}</p>
              <p className="mt-1 whitespace-pre-wrap rounded-[var(--radius-field)] bg-surface-2 p-3 text-[15px]">
                {ev.customerNotes}
              </p>
            </div>
          ) : null}
          <TextArea
            label={e.internalNotes}
            hint={e.internalNotesHint}
            value={notes}
            maxLength={2000}
            onChange={(x) => setNotes(x.target.value)}
            className="[&_textarea]:min-h-20"
          />

          {target.mode === "create" || (isSeries && scope !== "this") ? (
            <fieldset className="space-y-3 rounded-[var(--radius-field)] border border-border p-3">
              <legend className="px-1 text-[15px] font-medium">{e.repeat}</legend>
              <Select
                label={e.repeat}
                value={rec.repeat}
                onChange={(x) =>
                  setRec({
                    ...rec,
                    repeat: x.target.value as Repeat,
                    weekdays: rec.weekdays.length ? rec.weekdays : [wd],
                  })
                }
              >
                {(Object.keys(e.repeatOptions) as Repeat[]).map((k) => (
                  <option key={k} value={k}>
                    {e.repeatOptions[k]}
                  </option>
                ))}
              </Select>
              {rec.repeat !== "none" ? (
                <>
                  <Field
                    label={e.interval}
                    type="number"
                    min={1}
                    max={99}
                    value={rec.interval}
                    onChange={(x) => setRec({ ...rec, interval: Number(x.target.value) || 1 })}
                    className="max-w-40"
                  />
                  {rec.repeat === "weekly" ? (
                    <fieldset>
                      <legend className="text-[15px] font-medium">{e.weekdays}</legend>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {t.panel.weekdays.map((name, i) => (
                          <Checkbox
                            key={name}
                            label={<span className="capitalize">{name}</span>}
                            checked={rec.weekdays.includes(i + 1)}
                            onChange={(x) =>
                              setRec({
                                ...rec,
                                weekdays: x.target.checked
                                  ? [...rec.weekdays, i + 1]
                                  : rec.weekdays.filter((d) => d !== i + 1),
                              })
                            }
                          />
                        ))}
                      </div>
                    </fieldset>
                  ) : null}
                  <Select
                    label={e.ends}
                    value={rec.ends}
                    onChange={(x) => setRec({ ...rec, ends: x.target.value as Ends })}
                  >
                    {(Object.keys(e.endsOptions) as Ends[]).map((k) => (
                      <option key={k} value={k}>
                        {e.endsOptions[k]}
                      </option>
                    ))}
                  </Select>
                  {rec.ends === "until" ? (
                    <Field
                      label={e.untilDate}
                      type="date"
                      required
                      value={rec.until}
                      onChange={(x) => setRec({ ...rec, until: x.target.value })}
                    />
                  ) : null}
                  {rec.ends === "count" ? (
                    <Field
                      label={e.count}
                      type="number"
                      min={1}
                      max={730}
                      value={rec.count}
                      onChange={(x) => setRec({ ...rec, count: Number(x.target.value) || 1 })}
                      className="max-w-40"
                    />
                  ) : null}
                </>
              ) : null}
            </fieldset>
          ) : null}

          {isSeries ? (
            <fieldset className="space-y-2">
              <legend className="text-[15px] font-medium">{e.scopeTitle}</legend>
              {(["this", "following", "all"] as const).map((s) => (
                <label key={s} className="flex min-h-11 items-center gap-3">
                  <input
                    type="radio"
                    name="scope"
                    value={s}
                    checked={scope === s}
                    onChange={() => setScope(s)}
                    className="size-4 accent-[var(--primary)]"
                  />
                  {e.scopes[s]}
                </label>
              ))}
            </fieldset>
          ) : null}

          {kind === "block" && target.mode === "create" ? (
            <Checkbox
              label={e.cancelOverlapping}
              checked={cancelOverlapping}
              onChange={(x) => setCancelOverlapping(x.target.checked)}
            />
          ) : null}
        </fieldset>

        {conflicts ? (
          <Alert tone="warning">
            <p className="font-medium">{e.conflictsTitle}</p>
            <ul className="mt-1 list-disc pl-5">
              {conflicts.map((c) => (
                <li key={c.start}>
                  {formatDateTime(c.start, site.lang, tz)} ({e.conflictReasons[c.reason]})
                </li>
              ))}
            </ul>
            {target.mode === "create" ? (
              <Button variant="secondary" className="mt-3" onClick={() => void save("skip")} loading={busy}>
                {e.skipConflicts}
              </Button>
            ) : null}
          </Alert>
        ) : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}

        {ev && ev.kind === "appointment" && past && canWrite ? (
          <fieldset className="space-y-2">
            <legend className="text-[15px] font-medium">{e.attendance}</legend>
            <div className="flex flex-wrap gap-2">
              {(["attended", "no_show", ""] as const).map((a) => (
                <Button
                  key={a || "clear"}
                  variant={(ev.attendance ?? "") === a ? "primary" : "secondary"}
                  onClick={() => void attendance(a)}
                  aria-pressed={(ev.attendance ?? "") === a}
                >
                  {e.attendanceOptions[a || "clear"]}
                </Button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {canWrite ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <Button type="submit" size="lg" loading={busy}>
              {e.save}
            </Button>
            {ev && ev.status !== "cancelled" ? (
              confirmCancel ? (
                <div className="w-full space-y-3">
                  {ev.kind === "appointment" ? (
                    <Field
                      label={e.cancelReason}
                      value={reason}
                      maxLength={500}
                      onChange={(x) => setReason(x.target.value)}
                      optional
                    />
                  ) : null}
                  <Button variant="danger" onClick={() => void cancel()} loading={busy}>
                    {e.confirmCancel}
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" className="text-danger" onClick={() => setConfirmCancel(true)}>
                  {ev.kind === "block" ? e.removeBlock : e.cancelEvent}
                </Button>
              )
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted">{t.panel.calendar.readOnly}</p>
        )}
      </form>
    </Dialog>
  );
}
