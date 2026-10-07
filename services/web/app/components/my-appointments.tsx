import { CalendarClock, Download, Loader2, MapPin } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { type ApiError, errorText } from "~/lib/api-client";
import type { MyBooking } from "~/lib/booking-types";
import { customerRequest, customerSession, downloadIcs, setCustomerSession } from "~/lib/customer";
import { fmt, useRoot } from "~/lib/i18n";
import { browserTz, formatDateTime } from "~/lib/time";
import { CopyField } from "./copy-field";
import { OtpForm } from "./otp-form";
import { SlotPicker } from "./slot-picker";
import { Alert, Button, Card } from "./ui";

/** «Mis citas» del cliente final: ver, reprogramar, cancelar y añadir al calendario. */
export function MyAppointments() {
  const { site, t } = useRoot();
  const m = t.booking.my;
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [items, setItems] = useState<MyBooking[] | null>(null);
  const [past, setPast] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [tz, setTz] = useState("UTC");
  const [feed, setFeed] = useState<{ slug: string; webcal: string } | null>(null);
  useEffect(() => setTz(browserTz()), []);

  const load = useCallback(async () => {
    try {
      setItems(await customerRequest<MyBooking[]>("GET", `/api/public/v1/my/bookings?includePast=${past}`));
      setSignedIn(true);
    } catch (err) {
      if ((err as ApiError).status === 401) setSignedIn(false);
      else setNotice({ tone: "danger", text: errorText(t.booking.errors, err) });
    }
  }, [past, t.booking.errors]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(b: MyBooking) {
    if (!window.confirm(m.cancelConfirm)) return;
    try {
      await customerRequest("POST", `/api/public/v1/my/bookings/${b.id}/cancel`, {});
      setNotice({ tone: "success", text: m.cancelled });
      await load();
    } catch (err) {
      setNotice({ tone: "danger", text: errorText(t.booking.errors, err) });
    }
  }

  async function reschedule(b: MyBooking, start: string) {
    try {
      await customerRequest("PATCH", `/api/public/v1/my/bookings/${b.id}`, {
        start,
        expectedVersion: b.version,
      });
      setMoving(null);
      setNotice({ tone: "success", text: m.rescheduled });
      await load();
    } catch (err) {
      setNotice({ tone: "danger", text: errorText(t.booking.errors, err) });
    }
  }

  if (signedIn === null) {
    return (
      <p className="flex items-center gap-2 text-muted">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        {t.common.ui.loading}
      </p>
    );
  }
  if (!signedIn) {
    return (
      <Card className="mx-auto max-w-md p-6">
        <h2 className="text-xl font-semibold">{m.signInTitle}</h2>
        <p className="mt-2 text-muted">{m.signInLead}</p>
        <div className="mt-5">
          <OtpForm submitLabel={m.enter} onVerified={() => load()} />
        </div>
      </Card>
    );
  }
  const now = Date.now();
  return (
    <div>
      {notice ? (
        <Alert tone={notice.tone} className="mb-5">
          {notice.text}
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{past ? m.past : m.upcoming}</h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setPast((v) => !v)}>
            {past ? m.upcoming : m.showPast}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setCustomerSession(null);
              void fetch("/api/auth/sign-out", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: "{}",
              }).finally(() => setSignedIn(false));
            }}
          >
            {m.signOut}
          </Button>
        </div>
      </div>
      {items && items.length === 0 ? <p className="mt-4 text-muted">{m.none}</p> : null}
      <ul className="mt-4 space-y-3">
        {(items ?? []).map((b) => {
          // La API ya separa próximas y pasadas con la hora del servidor.
          const upcoming = !past || Date.parse(b.start) > now;
          return (
            <li key={b.id}>
              <Card className="p-5">
                <p className="font-semibold">
                  {b.service ?? ""} · {b.calendar?.name}
                </p>
                <p className="mt-1 flex items-center gap-2">
                  <CalendarClock aria-hidden className="size-4 text-muted" />
                  {formatDateTime(b.start, site.lang, tz)}
                </p>
                {b.calendar?.address ? (
                  <p className="mt-1 flex items-center gap-2 text-[15px] text-muted">
                    <MapPin aria-hidden className="size-4" />
                    {b.calendar.address}
                  </p>
                ) : null}
                {upcoming && b.cancelMinNoticeMinutes > 0 ? (
                  <p className="mt-2 text-sm text-muted">
                    {fmt(m.noticeRule, { hours: Math.round(b.cancelMinNoticeMinutes / 60) })}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void downloadIcs(b.id)}>
                    <Download aria-hidden className="size-4" />
                    {m.addToCalendar}
                  </Button>
                  {upcoming ? (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => setMoving(moving === b.id ? null : b.id)}
                        aria-expanded={moving === b.id}
                      >
                        {m.reschedule}
                      </Button>
                      <Button variant="ghost" className="text-danger" onClick={() => void cancel(b)}>
                        {m.cancel}
                      </Button>
                    </>
                  ) : null}
                </div>
                {feed && feed.slug === b.calendar?.slug ? (
                  <div className="mt-4 space-y-2">
                    <CopyField label="webcal://" value={feed.webcal} />
                    <p className="text-sm text-muted">{m.subscribeHelp}</p>
                  </div>
                ) : null}
                {moving === b.id && b.calendar && b.serviceId ? (
                  <div className="mt-5 border-t border-border pt-5">
                    <SlotPicker
                      slug={b.calendar.slug}
                      serviceId={b.serviceId}
                      tz={tz}
                      onTzChange={setTz}
                      businessTz={b.calendar.timezone}
                      onPick={(s) => void reschedule(b, s.start)}
                    />
                  </div>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="sr-only" aria-live="polite">
        {customerSession()?.email ?? ""}
      </p>
    </div>
  );
}
