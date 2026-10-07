import { SLOT_STEPS } from "@mcet/schemas";
import { type FormEvent, useState } from "react";
import { apiRequest, errorText } from "~/lib/api-client";
import { useRoot } from "~/lib/i18n";
import type { ServiceView } from "~/lib/panel-types";
import { Select } from "./select";
import { Alert, Button, Checkbox, Field } from "./ui";

/** Alta y edición de un servicio (nombre en los dos idiomas, duración, márgenes y límites). */
export function ServiceForm({
  calendarId,
  service,
  onDone,
}: {
  calendarId: string;
  service?: ServiceView;
  onDone: () => void;
}) {
  const { site, t } = useRoot();
  const s = t.panel.settings;
  const other = site.lang === "es" ? "en" : "es";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => Number(f.get(k) ?? 0);
    const body = {
      name: {
        [site.lang]: String(f.get("name") ?? "").trim(),
        [other]: String(f.get("nameOther") ?? "").trim(),
      },
      durationMin: n("duration"),
      slotStepMin: n("step"),
      bufferBeforeMin: n("before"),
      bufferAfterMin: n("after"),
      minNoticeMin: n("notice"),
      maxAdvanceDays: n("advance"),
      dailyLimit: n("limit"),
      active: f.get("active") === "on",
    };
    setBusy(true);
    setError(null);
    try {
      if (service) await apiRequest("PUT", `/api/v1/calendars/${calendarId}/services/${service.id}`, body);
      else await apiRequest("POST", `/api/v1/calendars/${calendarId}/services`, body);
      onDone();
    } catch (err) {
      setError(errorText(t.panel.errors, err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field
        label={s.serviceName}
        name="name"
        required
        maxLength={120}
        defaultValue={service?.name[site.lang] ?? ""}
      />
      <Field
        label={s.serviceNameOther}
        name="nameOther"
        optional
        maxLength={120}
        defaultValue={service?.name[other] ?? ""}
      />
      <Field
        label={s.duration}
        name="duration"
        type="number"
        min={5}
        max={720}
        required
        defaultValue={service?.durationMin ?? 30}
      />
      <Select label={s.slotStep} name="step" defaultValue={service?.slotStepMin ?? 30}>
        {SLOT_STEPS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </Select>
      <Field
        label={s.bufferBefore}
        name="before"
        type="number"
        min={0}
        max={240}
        defaultValue={service?.bufferBeforeMin ?? 0}
      />
      <Field
        label={s.bufferAfter}
        name="after"
        type="number"
        min={0}
        max={240}
        defaultValue={service?.bufferAfterMin ?? 0}
      />
      <Field
        label={s.minNotice}
        name="notice"
        type="number"
        min={0}
        max={43200}
        defaultValue={service?.minNoticeMin ?? 60}
      />
      <Field
        label={s.maxAdvance}
        name="advance"
        type="number"
        min={1}
        max={365}
        defaultValue={service?.maxAdvanceDays ?? 60}
      />
      <Field
        label={s.dailyLimit}
        name="limit"
        type="number"
        min={0}
        max={500}
        defaultValue={service?.dailyLimit ?? 0}
      />
      <Checkbox
        name="active"
        label={s.active}
        defaultChecked={service?.active ?? true}
        className="self-end"
      />
      {error ? (
        <Alert tone="danger" className="sm:col-span-2">
          {error}
        </Alert>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" loading={busy}>
          {s.save}
        </Button>
      </div>
    </form>
  );
}
