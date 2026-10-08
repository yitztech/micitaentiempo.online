import { CalendarCheck2, CheckCircle2, Clock3, Download, MapPin } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAltcha } from "~/lib/altcha";
import { type ApiError, errorText, postJson } from "~/lib/api-client";
import { type Booking, calendarLinks, type PublicCalendar } from "~/lib/booking-types";
import { customerRequest, customerSession, downloadIcs } from "~/lib/customer";
import { cx, fmt, useRoot } from "~/lib/i18n";
import { browserTz, formatDateTime, formatTime, tzLabel } from "~/lib/time";
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

/**
 * Flujo de reserva del cliente final (página pública y embed).
 * Cumple con los criterios de PROPUESTA.md:
 * - Etapas reales de 4 pasos (B1).
 * - Contexto de servicio y duración siempre visible (B2).
 * - Resumen completo con fecha, hora, duración y zona horaria (B3).
 * - Selección explícita de horario (B5).
 * - Atributos name en campos (B6).
 * - Gestión de foco al avanzar de etapa (B7).
 * - Manejo de estados obligatorios (B8).
 */
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
  const stepTitleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => setTz(browserTz()), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: enfocar el título de la etapa al cambiar de paso
  useEffect(() => {
    stepTitleRef.current?.focus();
  }, [step]);

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

  // Resumen completo con servicio, duración, fecha/hora y zona horaria (B3)
  const summary =
    slot && service ? (
      <section
        className="rounded-[var(--radius-field)] bg-surface-2 p-4 text-[15px]"
        aria-label={b.summary.label}
      >
        <div className="flex items-center gap-2 font-semibold text-text">
          <CalendarCheck2 aria-hidden className="size-4 text-primary shrink-0" />
          <span>{service.name}</span>
          <span className="text-sm font-normal text-muted tabular">
            ({fmt(b.service.minutes, { n: service.durationMin })})
          </span>
        </div>
        <p className="mt-1.5 flex items-center gap-2 text-text">
          <Clock3 aria-hidden className="size-4 text-muted shrink-0" />
          <span>{formatDateTime(slot.start, site.lang, tz)}</span>
          <span className="text-sm text-muted">({tzLabel(tz, site.lang)})</span>
        </p>
        {calendar.address ? (
          <p className="mt-1 flex items-center gap-2 text-muted">
            <MapPin aria-hidden className="size-4 text-muted shrink-0" />
            <span>{calendar.address}</span>
          </p>
        ) : null}
      </section>
    ) : null;

  // Estados obligatorios iniciales (B8)
  if (!calendar.bookable) return <Alert tone="warning">{b.unavailable}</Alert>;
  if (calendar.services.length === 0) return <Alert tone="info">{b.noServices}</Alert>;

  // Índice para el paso activo de 4 pasos (B1)
  const stepIndex = { service: 0, slot: 1, details: 2, verify: 2, done: 3 }[step];

  return (
    <div>
      {/* Indicador de etapas reales (B1) */}
      <ol className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label={b.steps.join(", ")}>
        {b.steps.map((label, i) => {
          const isCurrent = i === stepIndex;
          const isPast = i < stepIndex;
          return (
            <li
              key={label}
              aria-current={isCurrent ? "step" : undefined}
              className={cx(
                "flex items-center gap-1.5",
                isCurrent && "font-semibold text-primary",
                isPast && "text-text font-medium",
                !isCurrent && !isPast && "text-muted",
              )}
            >
              <span className="tabular">{i + 1}.</span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>

      {notice ? (
        <Alert tone="warning" className="mb-5">
          {notice}
        </Alert>
      ) : null}

      {/* Etapa 1: Elección de servicio si hay más de uno */}
      {step === "service" ? (
        <section aria-labelledby="titulo-servicio">
          <h2
            id="titulo-servicio"
            ref={stepTitleRef}
            tabIndex={-1}
            className="text-lg font-semibold text-text outline-none focus:outline-none"
          >
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
                  className="flex min-h-14 w-full items-center justify-between gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 text-left transition-colors hover:border-primary hover:bg-surface-2"
                >
                  <span>
                    <span className="block font-semibold text-text">{s.name}</span>
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

      {/* Etapa 2: Fecha y hora (B2: siempre muestra contexto del servicio y duración) */}
      {step === "slot" && service ? (
        <div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-soft)]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">{b.steps[0]}</p>
              <h2
                ref={stepTitleRef}
                tabIndex={-1}
                className="text-lg font-semibold text-text outline-none focus:outline-none"
              >
                {service.name}
              </h2>
              {service.description ? (
                <p className="mt-0.5 text-sm text-muted">{service.description}</p>
              ) : null}
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted tabular">
                <Clock3 aria-hidden className="size-4 shrink-0 text-muted" />
                <span>{fmt(b.service.minutes, { n: service.durationMin })}</span>
              </p>
            </div>
            {calendar.services.length > 1 ? (
              <Button variant="secondary" size="md" onClick={() => setStep("service")}>
                {b.change}
              </Button>
            ) : null}
          </div>

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
        </div>
      ) : null}

      {/* Etapa 3: Datos del cliente */}
      {step === "details" ? (
        <section aria-labelledby="titulo-datos" className="mx-auto max-w-lg">
          <h2
            id="titulo-datos"
            ref={stepTitleRef}
            tabIndex={-1}
            className="text-lg font-semibold text-text outline-none focus:outline-none"
          >
            {b.details.title}
          </h2>
          <p className="mt-1 text-sm text-muted">{b.details.lead}</p>
          <div className="mt-4">{summary}</div>
          <button
            type="button"
            className="mt-2 min-h-11 text-[15px] font-medium text-primary underline underline-offset-2"
            onClick={() => setStep("slot")}
          >
            {b.change}
          </button>
          <form
            method="post"
            onSubmit={submitDetails}
            onFocus={() => void altcha.start().catch(() => undefined)}
            className="mt-4 space-y-4"
          >
            <Field
              name="name"
              label={b.details.name}
              autoComplete="name"
              required
              maxLength={120}
              value={person.name}
              onChange={(e) => setPerson({ ...person, name: e.target.value })}
            />
            <Field
              name="email"
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
              name="phone"
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
              name="notes"
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

      {/* Subetapa: Verificación OTP con horario apartado */}
      {step === "verify" && hold ? (
        <section aria-labelledby="titulo-verificar" className="mx-auto max-w-lg">
          <h2
            id="titulo-verificar"
            ref={stepTitleRef}
            tabIndex={-1}
            className="text-lg font-semibold text-text outline-none focus:outline-none"
          >
            {b.verify.title}
          </h2>
          <div className="mt-4">{summary}</div>
          <div className="mt-4 rounded-[var(--radius-field)] border border-primary/30 bg-primary-soft p-3 text-[15px]">
            <p className="flex items-center gap-2 font-medium text-text">
              <Clock3 aria-hidden className="size-4 text-primary shrink-0" />
              <span className="tabular">
                {fmt(b.details.held, {
                  time: `${Math.floor(remaining / 60_000)}:${String(Math.floor((remaining % 60_000) / 1000)).padStart(2, "0")}`,
                })}
              </span>
            </p>
          </div>
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

      {/* Etapa 4: Confirmación completada */}
      {step === "done" && booking && service ? (
        <section aria-labelledby="titulo-hecho" className="mx-auto max-w-lg text-center">
          <CheckCircle2 aria-hidden className="mx-auto size-12 text-success" />
          <h2
            id="titulo-hecho"
            ref={stepTitleRef}
            tabIndex={-1}
            className="mt-3 text-2xl font-semibold text-text outline-none focus:outline-none"
          >
            {b.done.title}
          </h2>
          <p className="mt-2 text-muted">{fmt(b.done.lead, { email: person.email })}</p>

          <div className="mt-6 rounded-[var(--radius-card)] border border-border bg-surface p-5 text-left shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-2 font-semibold text-text">
              <CalendarCheck2 aria-hidden className="size-4 text-primary shrink-0" />
              <span>{service.name}</span>
              <span className="text-sm font-normal text-muted tabular">
                ({fmt(b.service.minutes, { n: service.durationMin })})
              </span>
            </div>
            <p className="mt-2 text-[15px] font-medium text-text">
              {formatDateTime(booking.start, site.lang, tz)}
            </p>
            <p className="text-sm text-muted tabular">
              {formatTime(booking.start, site.lang, tz)} – {formatTime(booking.end, site.lang, tz)} (
              {tzLabel(tz, site.lang)})
            </p>
            {calendar.address ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                <MapPin aria-hidden className="size-4 shrink-0" />
                {calendar.address}
              </p>
            ) : null}
          </div>

          <div className="mt-6">
            <p className="text-sm font-medium text-muted mb-3">{b.done.addTo}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {(() => {
                const links = calendarLinks({
                  start: booking.start,
                  end: booking.end,
                  title: `${service.name} · ${calendar.name}`,
                  location: calendar.address,
                });
                return (
                  <>
                    <a
                      href={links.google}
                      target="_blank"
                      rel="noopener"
                      className={buttonClass("secondary")}
                    >
                      {b.done.addGoogle}
                    </a>
                    <a
                      href={links.outlook}
                      target="_blank"
                      rel="noopener"
                      className={buttonClass("secondary")}
                    >
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
          </div>

          <div className="mt-8 flex flex-col items-center gap-2">
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
