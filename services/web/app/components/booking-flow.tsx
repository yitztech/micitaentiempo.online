import { CalendarCheck2, CheckCircle2, Clock3, Download, MapPin } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useAltcha } from "~/lib/altcha";
import { type ApiError, errorText, postJson } from "~/lib/api-client";
import { type Booking, calendarLinks, type PublicCalendar } from "~/lib/booking-types";
import { customerRequest, customerSession, downloadIcs } from "~/lib/customer";
import { cx, fmt, useRoot } from "~/lib/i18n";
import { browserTz, formatDateTime, formatTime } from "~/lib/time";
import { AltchaStatus } from "./altcha-status";
import { OtpForm } from "./otp-form";
import { type Slot, SlotPicker } from "./slot-picker";
import { Alert, Button, buttonClass, Field, TextArea } from "./ui";

/** Lo que dura un horario apartado (igual que el motor). */
const HOLD_MS = 10 * 60_000;

type Step = "service" | "slot" | "details" | "verify" | "done";

interface Hold {
  id: string;
  token: string;
  expiresAt: string;
}

/** Flujo de reserva del cliente final (página pública y embed). */
export function BookingFlow({
  calendar,
  myAppointmentsHref,
  onMyAppointments,
  onConfirmed,
}: {
  calendar: PublicCalendar;
  myAppointmentsHref: string;
  onMyAppointments?: () => void;
  onConfirmed?: (b: Booking, serviceName: string) => void;
}) {
  const { site, t } = useRoot();
  const b = t.booking;
  const [tz, setTz] = useState("UTC");
  const [step, setStep] = useState<Step>(calendar.services.length === 1 ? "slot" : "service");
  const [serviceId, setServiceId] = useState(
    calendar.services.length === 1 ? (calendar.services[0]?.id ?? "") : "",
  );
  const [slot, setSlot] = useState<Slot | null>(null);
  const [hold, setHold] = useState<Hold | null>(null);
  const [person, setPerson] = useState({ name: "", email: "", phone: "", notes: "" });
  const [booking, setBooking] = useState<Booking | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(Date.now());
  const altcha = useAltcha();

  useEffect(() => setTz(browserTz()), []);
  useEffect(() => {
    if (!hold) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [hold]);

  const service = calendar.services.find((s) => s.id === serviceId);
  const remaining = hold ? Math.max(0, Date.parse(hold.expiresAt) - now) : 0;
  useEffect(() => {
    if (hold && remaining === 0 && step !== "done") {
      setHold(null);
      setNotice(b.details.expired);
      setStep("slot");
      setRefresh((n) => n + 1);
    }
  }, [hold, remaining, step, b.details.expired]);

  function backToSlots(message: string) {
    setNotice(message);
    setHold(null);
    setStep("slot");
    setRefresh((n) => n + 1);
  }

  async function submitDetails(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!slot) return;
    setBusy(true);
    setError(null);
    try {
      const token = await altcha.token();
      const res = await postJson<{ hold: Booking; holdToken: string }>(
        `/api/public/v1/calendars/${calendar.slug}/holds`,
        {
          serviceId,
          start: slot.start,
          attendee: {
            name: person.name,
            email: person.email,
            ...(person.phone ? { phone: person.phone } : {}),
            timezone: tz,
          },
          ...(person.notes ? { notes: person.notes } : {}),
          channel: window.self !== window.top ? "embed" : "public",
        },
        { "x-altcha": token, "idempotency-key": crypto.randomUUID() },
      );
      setHold({
        id: res.hold.id,
        token: res.holdToken,
        // Cuenta atrás relativa: no depende de que el reloj del visitante coincida con el del servidor.
        expiresAt: new Date(Date.now() + HOLD_MS).toISOString(),
      });
      const session = customerSession();
      if (session && session.email.toLowerCase() === person.email.toLowerCase()) {
        await confirm(res.hold.id, res.holdToken);
      } else {
        setStep("verify");
      }
    } catch (err) {
      if ((err as ApiError).code === "slot_taken") backToSlots(b.taken);
      else setError(errorText(b.errors, err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(id = hold?.id, holdToken = hold?.token) {
    if (!id || !holdToken) return;
    try {
      const res = await customerRequest<Booking>("POST", `/api/public/v1/holds/${id}/confirm`, {
        holdToken,
        name: person.name,
        ...(person.phone ? { phone: person.phone } : {}),
        timezone: tz,
        ...(person.notes ? { notes: person.notes } : {}),
      });
      setBooking(res);
      setHold(null);
      setStep("done");
      onConfirmed?.(res, service?.name ?? "");
    } catch (err) {
      const code = (err as ApiError).code;
      if (code === "hold_expired" || code === "hold_not_found" || code === "slot_taken")
        backToSlots(errorText(b.errors, err));
      else throw err;
    }
  }

  const summary =
    slot && service ? (
      <div className="rounded-[var(--radius-field)] bg-surface-2 p-4 text-[15px]">
        <p className="flex items-center gap-2 font-semibold">
          <CalendarCheck2 aria-hidden className="size-4 text-primary" />
          {service.name}
        </p>
        <p className="mt-1 flex items-center gap-2">
          <Clock3 aria-hidden className="size-4 text-muted" />
          {formatDateTime(slot.start, site.lang, tz)}
        </p>
        {calendar.address ? (
          <p className="mt-1 flex items-center gap-2">
            <MapPin aria-hidden className="size-4 text-muted" />
            {calendar.address}
          </p>
        ) : null}
      </div>
    ) : null;

  if (!calendar.bookable) return <Alert tone="warning">{b.unavailable}</Alert>;

  return (
    <div>
      <ol className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label={b.steps.join(", ")}>
        {b.steps.map((label, i) => {
          const index = { service: 0, slot: 2, details: 3, verify: 3, done: 4 }[step];
          return (
            <li
              key={label}
              aria-current={i === index ? "step" : undefined}
              className={cx(i === index && "font-semibold text-primary", i < index && "text-text")}
            >
              {i + 1}. {label}
            </li>
          );
        })}
      </ol>
      {notice ? (
        <Alert tone="warning" className="mb-5">
          {notice}
        </Alert>
      ) : null}

      {step === "service" ? (
        <section aria-labelledby="titulo-servicio">
          <h2 id="titulo-servicio" className="text-lg font-semibold">
            {b.service.title}
          </h2>
          <ul className="mt-4 space-y-3">
            {calendar.services.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setServiceId(s.id);
                    setStep("slot");
                  }}
                  className="flex min-h-14 w-full items-center justify-between gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 text-left hover:border-primary"
                >
                  <span>
                    <span className="block font-semibold">{s.name}</span>
                    {s.description ? (
                      <span className="mt-0.5 block text-sm text-muted">{s.description}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-sm text-muted tabular">
                    {fmt(b.service.minutes, { n: s.durationMin })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {step === "slot" && service ? (
        <>
          {calendar.services.length > 1 ? (
            <p className="mb-4 flex items-center gap-2 text-[15px]">
              <span className="font-semibold">{service.name}</span>
              <button
                type="button"
                className="min-h-11 text-primary underline underline-offset-2"
                onClick={() => setStep("service")}
              >
                {b.change}
              </button>
            </p>
          ) : null}
          <SlotPicker
            slug={calendar.slug}
            serviceId={serviceId}
            tz={tz}
            onTzChange={setTz}
            businessTz={calendar.timezone}
            refreshKey={refresh}
            onPick={(s) => {
              setSlot(s);
              setNotice(null);
              setStep("details");
            }}
          />
        </>
      ) : null}

      {step === "details" ? (
        <section aria-labelledby="titulo-datos" className="mx-auto max-w-lg">
          <h2 id="titulo-datos" className="text-lg font-semibold">
            {b.details.title}
          </h2>
          <div className="mt-4">{summary}</div>
          <button
            type="button"
            className="mt-2 min-h-11 text-[15px] text-primary underline underline-offset-2"
            onClick={() => setStep("slot")}
          >
            {b.change}
          </button>
          <form
            onSubmit={submitDetails}
            onFocus={() => void altcha.start().catch(() => undefined)}
            className="mt-4 space-y-4"
          >
            <Field
              label={b.details.name}
              autoComplete="name"
              required
              maxLength={120}
              value={person.name}
              onChange={(e) => setPerson({ ...person, name: e.target.value })}
            />
            <Field
              label={b.details.email}
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              hint={b.details.emailHint}
              value={person.email}
              onChange={(e) => setPerson({ ...person, email: e.target.value })}
            />
            <Field
              label={b.details.phone}
              type="tel"
              autoComplete="tel"
              optional
              pattern="\+[1-9][0-9 ]{6,18}"
              hint={b.details.phoneHint}
              value={person.phone}
              onChange={(e) => setPerson({ ...person, phone: e.target.value })}
            />
            <TextArea
              label={b.details.notes}
              maxLength={1000}
              value={person.notes}
              onChange={(e) => setPerson({ ...person, notes: e.target.value })}
              className="[&_textarea]:min-h-20"
            />
            <AltchaStatus state={altcha.state} onRetry={() => void altcha.start().catch(() => undefined)} />
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              {b.details.submit}
            </Button>
          </form>
        </section>
      ) : null}

      {step === "verify" && hold ? (
        <section aria-labelledby="titulo-verificar" className="mx-auto max-w-lg">
          <h2 id="titulo-verificar" className="text-lg font-semibold">
            {b.verify.title}
          </h2>
          <div className="mt-4">{summary}</div>
          <Alert tone="info" className="mt-4">
            <span className="tabular">
              {fmt(b.details.held, {
                time: `${Math.floor(remaining / 60_000)}:${String(Math.floor((remaining % 60_000) / 1000)).padStart(2, "0")}`,
              })}
            </span>
          </Alert>
          <div className="mt-4">
            <OtpForm
              email={person.email}
              name={person.name}
              autoSend
              submitLabel={b.verify.confirm}
              onVerified={() => confirm()}
            />
          </div>
        </section>
      ) : null}

      {step === "done" && booking && service ? (
        <section aria-labelledby="titulo-hecho" className="mx-auto max-w-lg text-center">
          <CheckCircle2 aria-hidden className="mx-auto size-12 text-success" />
          <h2 id="titulo-hecho" className="mt-3 text-2xl font-semibold">
            {b.done.title}
          </h2>
          <p className="mt-2 text-muted">{fmt(b.done.lead, { email: person.email })}</p>
          <p className="mt-4 font-semibold">{service.name}</p>
          <p>{formatDateTime(booking.start, site.lang, tz)}</p>
          <p className="text-sm text-muted tabular">
            {formatTime(booking.start, site.lang, tz)} – {formatTime(booking.end, site.lang, tz)}
          </p>
          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            {(() => {
              const links = calendarLinks({
                start: booking.start,
                end: booking.end,
                title: `${service.name} · ${calendar.name}`,
                location: calendar.address,
              });
              return (
                <>
                  <a href={links.google} target="_blank" rel="noopener" className={buttonClass("secondary")}>
                    {b.done.addGoogle}
                  </a>
                  <a href={links.outlook} target="_blank" rel="noopener" className={buttonClass("secondary")}>
                    {b.done.addOutlook}
                  </a>
                  <Button variant="secondary" onClick={() => void downloadIcs(booking.id)}>
                    <Download aria-hidden className="size-4" />
                    {b.done.downloadIcs}
                  </Button>
                </>
              );
            })()}
          </div>
          <div className="mt-6 flex flex-col items-center gap-2">
            {onMyAppointments ? (
              <Button size="lg" onClick={onMyAppointments}>
                {b.done.myAppointments}
              </Button>
            ) : (
              <a href={myAppointmentsHref} className={buttonClass("primary", "lg")}>
                {b.done.myAppointments}
              </a>
            )}
            <button
              type="button"
              className="min-h-11 text-[15px] text-primary underline underline-offset-2"
              onClick={() => {
                setBooking(null);
                setSlot(null);
                setRefresh((n) => n + 1);
                setStep(calendar.services.length > 1 ? "service" : "slot");
              }}
            >
              {b.done.another}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
