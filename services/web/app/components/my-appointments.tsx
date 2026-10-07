import { CalendarClock, Download, Loader2, MapPin, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { type ApiError, errorText } from "~/lib/api-client";
import type { MyBooking } from "~/lib/booking-types";
import { customerRequest, customerSession, downloadIcs, setCustomerSession } from "~/lib/customer";
import { cx, fmt, useRoot } from "~/lib/i18n";
import { browserTz, formatDateTime, tzLabel } from "~/lib/time";
import { CopyField } from "./copy-field";
import { OtpForm } from "./otp-form";
import { type Slot, SlotPicker } from "./slot-picker";
import { Alert, Badge, Button, Card } from "./ui";

/**
 * «Mis citas» del cliente final:
 * - C1: Estado de error recuperable con reintento (sin bloqueo en spinner infinito).
 * - C2: Reprogramar con revisión previa de horario actual vs. nuevo antes de guardar.
 * - C3: Próxima cita destacada jerárquicamente sobre el historial, estado con texto e icono, confirmación de cancelación.
 */
export function MyAppointments() {
  const { site, t } = useRoot();
  const m = t.booking.my;
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [items, setItems] = useState<MyBooking[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [past, setPast] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [rescheduleCandidate, setRescheduleCandidate] = useState<{ bookingId: string; slot: Slot } | null>(
    null,
  );
  const [rescheduling, setRescheduling] = useState(false);
  const [tz, setTz] = useState("UTC");
  const [feed] = useState<{ slug: string; webcal: string } | null>(null);

  useEffect(() => setTz(browserTz()), []);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      setItems(await customerRequest<MyBooking[]>("GET", `/api/public/v1/my/bookings?includePast=${past}`));
      setSignedIn(true);
    } catch (err) {
      if ((err as ApiError).status === 401) {
        setSignedIn(false);
      } else {
        setLoadError(errorText(t.booking.errors, err));
      }
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
    setRescheduling(true);
    try {
      await customerRequest("PATCH", `/api/public/v1/my/bookings/${b.id}`, {
        start,
        expectedVersion: b.version,
      });
      setMoving(null);
      setRescheduleCandidate(null);
      setNotice({ tone: "success", text: m.rescheduled });
      await load();
    } catch (err) {
      setNotice({ tone: "danger", text: errorText(t.booking.errors, err) });
    } finally {
      setRescheduling(false);
    }
  }

  // C1: Estado de error recuperable con Reintentar
  if (signedIn === null) {
    if (loadError) {
      return (
        <div className="rounded-[var(--radius-field)] border border-danger/30 bg-danger-soft p-4">
          <p className="text-[15px] text-danger">{loadError}</p>
          <Button variant="secondary" size="md" className="mt-3" onClick={() => void load()}>
            {t.booking.date.retry}
          </Button>
        </div>
      );
    }
    return (
      <p className="flex items-center gap-2 text-muted">
        <Loader2 aria-hidden className="size-4 animate-spin text-primary" />
        {t.common.ui.loading}
      </p>
    );
  }

  if (!signedIn) {
    return (
      <Card className="mx-auto max-w-md p-6">
        <h2 className="text-xl font-semibold text-text">{m.signInTitle}</h2>
        <p className="mt-2 text-muted">{m.signInLead}</p>
        <div className="mt-5">
          <OtpForm submitLabel={m.enter} onVerified={() => load()} />
        </div>
      </Card>
    );
  }

  const now = Date.now();
  const sortedItems = items ?? [];

  return (
    <div>
      {notice ? (
        <Alert tone={notice.tone} className="mb-5">
          {notice.text}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-text">{past ? m.past : m.upcoming}</h2>
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

      {sortedItems.length === 0 ? <p className="mt-4 text-muted">{m.none}</p> : null}

      <ul className="mt-4 space-y-4">
        {sortedItems.map((b, idx) => {
          const isUpcoming = !past || Date.parse(b.start) > now;
          const isPrimaryNext = !past && idx === 0 && isUpcoming;

          return (
            <li key={b.id}>
              <Card
                className={cx(
                  "p-5 transition-shadow",
                  isPrimaryNext && "border-primary/50 shadow-md ring-1 ring-primary/20",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isPrimaryNext ? (
                      <Badge className="bg-primary-soft text-primary font-semibold">
                        <Sparkles aria-hidden className="size-3.5" />
                        {m.nextAppointment}
                      </Badge>
                    ) : null}
                    <p className="font-semibold text-text text-base">
                      {b.service ?? ""} · {b.calendar?.name}
                    </p>
                  </div>
                </div>

                <p className="mt-2 flex items-center gap-2 text-text font-medium text-[15px]">
                  <CalendarClock aria-hidden className="size-4 text-primary shrink-0" />
                  <span>{formatDateTime(b.start, site.lang, tz)}</span>
                  <span className="text-xs text-muted tabular">({tzLabel(tz, site.lang)})</span>
                </p>

                {b.calendar?.address ? (
                  <p className="mt-1 flex items-center gap-2 text-[15px] text-muted">
                    <MapPin aria-hidden className="size-4 shrink-0" />
                    <span>{b.calendar.address}</span>
                  </p>
                ) : null}

                {isUpcoming && b.cancelMinNoticeMinutes > 0 ? (
                  <p className="mt-2 text-sm text-muted">
                    {fmt(m.noticeRule, { hours: Math.round(b.cancelMinNoticeMinutes / 60) })}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button variant="secondary" onClick={() => void downloadIcs(b.id)}>
                    <Download aria-hidden className="size-4" />
                    {m.addToCalendar}
                  </Button>
                  {isUpcoming ? (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setMoving(moving === b.id ? null : b.id);
                          setRescheduleCandidate(null);
                        }}
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

                {/* C2: Reprogramar con revisión previa de horario actual vs nuevo */}
                {moving === b.id && b.calendar && b.serviceId ? (
                  <div className="mt-6 border-t border-border pt-5">
                    <SlotPicker
                      slug={b.calendar.slug}
                      serviceId={b.serviceId}
                      tz={tz}
                      onTzChange={setTz}
                      businessTz={b.calendar.timezone}
                      onPick={(s) => setRescheduleCandidate({ bookingId: b.id, slot: s })}
                    />

                    {rescheduleCandidate && rescheduleCandidate.bookingId === b.id ? (
                      <div className="mt-6 rounded-[var(--radius-card)] border border-primary/30 bg-primary-soft p-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
                          {m.confirmReschedule}
                        </h3>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 text-[15px]">
                          <div className="rounded-[var(--radius-field)] bg-surface p-3 border border-border">
                            <p className="text-xs font-medium text-muted">{m.currentSchedule}</p>
                            <p className="mt-1 font-semibold text-text">
                              {formatDateTime(b.start, site.lang, tz)}
                            </p>
                            <p className="text-xs text-muted tabular">({tzLabel(tz, site.lang)})</p>
                          </div>
                          <div className="rounded-[var(--radius-field)] bg-surface p-3 border border-primary/40 ring-1 ring-primary/20">
                            <p className="text-xs font-medium text-primary">{m.newSchedule}</p>
                            <p className="mt-1 font-semibold text-text">
                              {formatDateTime(rescheduleCandidate.slot.start, site.lang, tz)}
                            </p>
                            <p className="text-xs text-muted tabular">({tzLabel(tz, site.lang)})</p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            variant="primary"
                            size="md"
                            loading={rescheduling}
                            onClick={() => void reschedule(b, rescheduleCandidate.slot.start)}
                          >
                            {m.confirmReschedule}
                          </Button>
                          <Button
                            variant="secondary"
                            size="md"
                            disabled={rescheduling}
                            onClick={() => setRescheduleCandidate(null)}
                          >
                            {m.cancelReschedule}
                          </Button>
                        </div>
                      </div>
                    ) : null}
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
