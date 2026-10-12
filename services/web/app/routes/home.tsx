import { pathFor } from "@mcet/i18n";
import {
  Activity,
  ArrowRight,
  BellRing,
  Briefcase,
  Calendar,
  CalendarCheck2,
  CalendarSync,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Globe2,
  Scissors,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
  XCircle,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Badge, Card, Container, LinkButton } from "~/components/ui";
import { cx, useRoot } from "~/lib/i18n";
import { metaFor, publicCacheHeaders } from "~/lib/seo";
import type { Route } from "./+types/home";

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.public.home.seoTitle, description: t.public.home.seoDescription }));

export const headers = () => publicCacheHeaders;

const ICONS = [CalendarCheck2, ShieldCheck, Globe2, Clock3, CalendarSync, Sparkles];

const SECTOR_ICONS = [Stethoscope, Scissors, Briefcase, Activity];

/** Datos estructurados de la portada (SoftwareApplication y Organization). */
function StructuredData() {
  const { site, t, nonce } = useRoot();
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: t.common.site.name,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: site.lang,
      url: site.siteUrl,
      description: t.common.site.description,
      offers: [
        { "@type": "Offer", name: t.public.pricing.plans.personal.name, price: "5", priceCurrency: "USD" },
        { "@type": "Offer", name: t.public.pricing.plans.branches.name, price: "20", priceCurrency: "USD" },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: t.common.site.name,
      url: site.siteUrl,
      logo: `${site.siteUrl}/favicon.svg`,
    },
  ];
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON propio, con < escapado
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

/** Maqueta interactiva visual de alta fidelidad para el Hero. */
function HeroPreview() {
  const { t } = useRoot();
  const h = t.public.home;
  const [selectedTime, setSelectedTime] = useState(2);

  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* Resplandores ambientales de fondo */}
      <div
        aria-hidden
        className="absolute -top-6 -right-6 -z-10 size-48 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -bottom-8 -left-8 -z-10 size-48 rounded-full bg-accent/25 blur-3xl"
      />

      {/* Tarjeta principal simulando dispositivo móvil / tarjeta de reserva */}
      <Card
        className="relative overflow-hidden border-border/80 bg-surface/95 p-6 shadow-2xl backdrop-blur"
        role="region"
        aria-label={h.previewLabel}
      >
        {/* Cabecera del negocio ficticio con valoración */}
        <div className="flex items-center justify-between border-b border-border/60 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-gradient-to-tr from-primary to-secondary text-on-primary shadow-sm">
              <CalendarCheck2 className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-text">{t.common.site.name}</span>
                <span className="inline-block size-2 rounded-full bg-success" title="En línea" />
              </div>
              <p className="text-xs text-muted">{h.previewService}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning">
            <Star className="size-3 fill-warning text-warning" />
            <span>4.9</span>
          </div>
        </div>

        {/* Selector de fecha */}
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="font-medium text-text capitalize">{h.previewDay}</span>
          <span className="text-xs text-muted">Zona horaria: America/Mexico_City</span>
        </div>

        {/* Cuadrícula de horarios con interactividad visual */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {h.previewTimes.map((time, i) => {
            const isSelected = selectedTime === i;
            return (
              <button
                type="button"
                key={time}
                onClick={() => setSelectedTime(i)}
                className={cx(
                  "relative flex min-h-11 items-center justify-center rounded-[var(--radius-field)] text-sm font-medium tabular transition-all",
                  isSelected
                    ? "bg-primary font-semibold text-on-primary shadow-md ring-2 ring-primary/30"
                    : "border border-border-field/70 bg-surface text-text hover:border-primary hover:bg-surface-2",
                )}
              >
                {time}
                {isSelected && (
                  <span
                    aria-hidden
                    className="absolute -top-1 -right-1 size-2 rounded-full bg-accent ring-2 ring-surface"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Estado de confirmación instantánea */}
        <div className="mt-5 rounded-[var(--radius-field)] border border-success/30 bg-success-soft p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-success">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{h.previewConfirm}</span>
          </div>
          <p className="mt-1 text-xs text-text/80">
            Código de seguridad enviado al correo. Archivo de calendario adjunto.
          </p>
        </div>

        {/* Integraciones soportadas */}
        <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3 text-[11px] text-muted">
          <span>Sincronización automática:</span>
          <div className="flex items-center gap-2 font-medium text-text">
            <span>Google</span>
            <span>·</span>
            <span>Outlook</span>
            <span>·</span>
            <span>Apple</span>
          </div>
        </div>
      </Card>

      {/* Insignia flotante superior izquierda */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-4 -left-4 hidden rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold shadow-lg sm:flex sm:items-center sm:gap-1.5"
      >
        <Zap className="size-3.5 text-accent" />
        <span>0 dobles reservas</span>
      </div>

      {/* Insignia flotante inferior derecha */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-4 -right-2 hidden rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-text shadow-lg sm:flex sm:items-center sm:gap-1.5"
      >
        <BellRing className="size-3.5 text-primary" />
        <span>Recordatorio 24h antes</span>
      </div>
    </div>
  );
}

export default function Home() {
  const { site, t } = useRoot();
  const h = t.public.home;
  const [activeSector, setActiveSector] = useState(0);

  const stats = h.stats;
  const sectors = h.sectors;
  const comparison = h.comparisonBeforeItems;
  const testimonials = h.testimonials;
  const faqList = h.faqHome;

  const currentSector = sectors[activeSector] ?? sectors[0];
  const SectorIcon = SECTOR_ICONS[activeSector] ?? Stethoscope;

  if (!currentSector) return null;

  return (
    <>
      <StructuredData />

      {/* ─── 1. HERO SECTION ─── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-surface to-background pb-16 pt-10 sm:pb-24 sm:pt-16 lg:pb-28">
        <Container className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <Badge>
              <BellRing aria-hidden className="size-4" />
              {h.eyebrow}
            </Badge>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-text sm:text-5xl lg:text-6xl">
              {h.title}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">{h.lead}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <LinkButton to={pathFor("signUp", site.lang)} size="lg" data-umami-event="sign_up_started">
                {h.ctaPrimary}
              </LinkButton>
              <LinkButton to={pathFor("pricing", site.lang)} size="lg" variant="secondary">
                {h.ctaSecondary}
              </LinkButton>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              <span>{h.trialNote}</span>
              <span className="hidden sm:inline">·</span>
              <span className="flex items-center gap-1 text-text">
                <ShieldCheck className="size-4 text-success" />
                <span>Cancela en cualquier momento</span>
              </span>
            </div>

            {/* Micro prueba social en el Hero */}
            <div className="mt-8 flex items-center gap-3 border-t border-border/60 pt-5">
              <div className="flex -space-x-2 overflow-hidden">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-on-primary ring-2 ring-surface">
                  SM
                </span>
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-on-primary ring-2 ring-surface">
                  JM
                </span>
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-on-primary ring-2 ring-surface">
                  RV
                </span>
              </div>
              <div className="text-xs text-muted">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: iconos estaticos
                    <Star key={i} className="size-3.5 fill-warning text-warning" />
                  ))}
                  <span className="ml-1 font-semibold text-text">4.9 / 5</span>
                </div>
                <span>Más de 2,500 negocios gestionando sus citas cada día</span>
              </div>
            </div>
          </div>
          <HeroPreview />
        </Container>
      </section>

      {/* ─── 2. BARRA DE CIFRAS Y CONFIANZA (STATS) ─── */}
      <section className="border-y border-border/80 bg-surface py-10">
        <Container>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-8">
            <div className="text-center sm:text-left">
              <p className="text-3xl font-bold tracking-tight text-primary sm:text-4xl tabular">
                {stats.businessesValue}
              </p>
              <p className="mt-1 text-sm font-medium text-muted">{stats.businessesLabel}</p>
            </div>
            <div className="text-center sm:text-left">
              <p className="text-3xl font-bold tracking-tight text-primary sm:text-4xl tabular">
                {stats.bookingsValue}
              </p>
              <p className="mt-1 text-sm font-medium text-muted">{stats.bookingsLabel}</p>
            </div>
            <div className="text-center sm:text-left">
              <p className="text-3xl font-bold tracking-tight text-success sm:text-4xl tabular">
                {stats.zeroCollisionsValue}
              </p>
              <p className="mt-1 text-sm font-medium text-muted">{stats.zeroCollisionsLabel}</p>
            </div>
            <div className="text-center sm:text-left">
              <p className="text-3xl font-bold tracking-tight text-primary sm:text-4xl tabular">
                {stats.uptimeValue}
              </p>
              <p className="mt-1 text-sm font-medium text-muted">{stats.uptimeLabel}</p>
            </div>
          </div>
        </Container>
      </section>

      {/* ─── 3. ZONAS DESCRIPTIVAS DEL NEGOCIO / SOLUCIONES POR INDUSTRIA ─── */}
      <section aria-labelledby="sectores-titulo" className="py-20 sm:py-24">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <Badge className="mx-auto">
              <Sparkles aria-hidden className="size-3.5" />
              <span>Para cada industria</span>
            </Badge>
            <h2
              id="sectores-titulo"
              className="mt-4 text-3xl font-semibold tracking-tight text-text sm:text-4xl"
            >
              {h.sectorsTitle}
            </h2>
            <p className="mt-3 text-lg text-muted">{h.sectorsSubtitle}</p>
          </div>

          {/* Selector de pestañas interactivas */}
          <div className="mt-10 flex flex-wrap justify-center gap-2 sm:gap-3">
            {sectors.map((sec, idx) => {
              const Icon = SECTOR_ICONS[idx] ?? Stethoscope;
              const isActive = activeSector === idx;
              return (
                <button
                  type="button"
                  key={sec.id}
                  onClick={() => setActiveSector(idx)}
                  className={cx(
                    "flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all sm:px-5",
                    isActive
                      ? "bg-primary text-on-primary shadow-md"
                      : "border border-border bg-surface text-muted hover:border-primary/50 hover:text-text",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{sec.name}</span>
                </button>
              );
            })}
          </div>

          {/* Tarjeta detallada de la industria seleccionada con maqueta visual */}
          <div className="mt-8 rounded-2xl border border-border/80 bg-surface p-6 shadow-sm sm:p-10">
            <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <span className="inline-block rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                  {currentSector.badge}
                </span>
                <h3 className="mt-3 text-2xl font-bold text-text sm:text-3xl">{currentSector.name}</h3>
                <p className="mt-1 text-base font-medium text-primary">{currentSector.tagline}</p>
                <p className="mt-4 text-base leading-relaxed text-muted">{currentSector.description}</p>

                <ul className="mt-6 space-y-3">
                  {currentSector.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2.5 text-sm text-text">
                      <CheckCircle2 className="size-4 shrink-0 text-success" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <LinkButton
                    to={pathFor("signUp", site.lang)}
                    size="md"
                    className="inline-flex items-center gap-2"
                  >
                    <span>Crear agenda para mi negocio</span>
                    <ArrowRight className="size-4" />
                  </LinkButton>
                </div>
              </div>

              {/* Maqueta representativa de la cita para este sector */}
              <div className="rounded-xl border border-border bg-surface-2 p-6">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary">
                      <SectorIcon className="size-4" />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Vista de la cita
                    </span>
                  </div>
                  <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success">
                    {currentSector.mockupStatus}
                  </span>
                </div>

                <div className="mt-4">
                  <p className="text-lg font-bold text-text">{currentSector.mockupService}</p>
                  <p className="text-sm text-muted">{currentSector.mockupProvider}</p>
                </div>

                <div className="mt-5 space-y-2 rounded-lg border border-border/80 bg-surface p-3.5 text-sm">
                  <div className="flex items-center gap-2 text-text font-medium">
                    <Calendar className="size-4 text-primary" />
                    <span>{currentSector.mockupTime}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <Clock3 className="size-3.5" />
                    <span>Margen automático de atención configurado</span>
                  </div>
                </div>

                <div className="mt-5 flex gap-2">
                  <div className="flex-1 rounded-[var(--radius-field)] border border-primary/30 bg-primary/5 py-2 text-center text-xs font-semibold text-primary">
                    Añadida al calendario
                  </div>
                  <div className="flex-1 rounded-[var(--radius-field)] border border-border bg-surface py-2 text-center text-xs font-semibold text-muted">
                    Reprogramar en 1 clic
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* ─── 4. CARACTERÍSTICAS CLAVE (HIGHLIGHTS) ─── */}
      <section aria-labelledby="destacados" className="border-t border-border/60 bg-surface py-20 sm:py-24">
        <Container>
          <div className="max-w-2xl">
            <Badge>Funciones principales</Badge>
            <h2 id="destacados" className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              {h.highlightsTitle}
            </h2>
          </div>
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {h.highlights.map((item, i) => {
              const Icon = ICONS[i] ?? Sparkles;
              return (
                <li
                  key={item.title}
                  className="group relative rounded-[var(--radius-card)] border border-border bg-background p-6 transition-all hover:border-primary/50 hover:shadow-md"
                >
                  <span className="flex size-11 items-center justify-center rounded-[var(--radius-field)] bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-on-primary">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-text">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      {/* ─── 5. EL ANTES Y DESPUÉS (COMPARISON) ─── */}
      <section aria-labelledby="comparativa-titulo" className="py-20 sm:py-24">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="comparativa-titulo"
              className="text-3xl font-semibold tracking-tight text-text sm:text-4xl"
            >
              {h.comparisonTitle}
            </h2>
            <p className="mt-3 text-lg text-muted">{h.comparisonSubtitle}</p>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-2">
            {/* Antes: El método tradicional */}
            <Card className="border-danger/30 bg-danger-soft/30 p-8">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger">
                  <XCircle className="size-5" />
                </span>
                <h3 className="text-xl font-bold text-danger">{h.comparisonBeforeTitle}</h3>
              </div>
              <ul className="mt-6 space-y-4">
                {comparison.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-text">
                    <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Después: Con Mi Cita en Tiempo */}
            <Card className="border-primary/40 bg-primary-soft/30 p-8 shadow-md">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary text-on-primary">
                  <CheckCircle2 className="size-5" />
                </span>
                <h3 className="text-xl font-bold text-primary">{h.comparisonAfterTitle}</h3>
              </div>
              <ul className="mt-6 space-y-4">
                {h.comparisonAfterItems.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-text font-medium">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </Container>
      </section>

      {/* ─── 6. PASOS SENCILLOS (STEPS) ─── */}
      <section aria-labelledby="pasos" className="border-t border-border/60 bg-surface py-20 sm:py-24">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="pasos" className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {h.stepsTitle}
            </h2>
            <p className="mt-3 text-muted">Empieza a recibir citas en menos de dos minutos.</p>
          </div>
          <ol className="mt-12 grid gap-8 md:grid-cols-3">
            {h.steps.map((step, i) => (
              <li
                key={step.title}
                className="relative rounded-2xl border border-border bg-background p-6 shadow-sm"
              >
                <span
                  className="flex size-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-on-primary tabular shadow-md"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <h3 className="mt-5 text-xl font-semibold text-text">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* ─── 7. TESTIMONIOS Y PRUEBA SOCIAL ─── */}
      <section aria-labelledby="testimonios-titulo" className="py-20 sm:py-24">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <Badge className="mx-auto">Experiencias reales</Badge>
            <h2
              id="testimonios-titulo"
              className="mt-4 text-3xl font-semibold tracking-tight text-text sm:text-4xl"
            >
              {h.testimonialsTitle}
            </h2>
            <p className="mt-3 text-lg text-muted">{h.testimonialsSubtitle}</p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <Card key={t.author} className="flex flex-col justify-between p-7">
                <div>
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: estrellas fijas
                      <Star key={i} className="size-4 fill-warning text-warning" />
                    ))}
                  </div>
                  <blockquote className="mt-4 text-sm leading-relaxed text-text">"{t.quote}"</blockquote>
                </div>
                <div className="mt-6 border-t border-border pt-4">
                  <p className="font-semibold text-text">{t.author}</p>
                  <p className="text-xs text-primary">{t.role}</p>
                  <p className="mt-0.5 text-xs text-muted">{t.city}</p>
                </div>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* ─── 8. PREGUNTAS FRECUENTES (FAQ HOME) ─── */}
      <section
        aria-labelledby="faq-home-titulo"
        className="border-t border-border/60 bg-surface py-20 sm:py-24"
      >
        <Container width="prose">
          <div className="text-center">
            <h2 id="faq-home-titulo" className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">
              {h.faqHomeTitle}
            </h2>
            <p className="mt-3 text-muted">{h.faqHomeSubtitle}</p>
          </div>

          <div className="mt-10 space-y-4">
            {faqList.map((item) => (
              <details
                key={item.q}
                className="group rounded-[var(--radius-card)] border border-border bg-background p-5 open:bg-surface open:shadow-sm"
              >
                <summary className="flex cursor-pointer items-center justify-between font-semibold text-text">
                  <span>{item.q}</span>
                  <ChevronDown className="size-5 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>

      {/* ─── 9. LLAMADO A LA ACCIÓN FINAL (CTA BAND) ─── */}
      <section className="py-16 sm:py-20">
        <Container>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary via-primary-hover to-primary p-8 text-on-primary shadow-xl sm:p-14">
            <div
              aria-hidden
              className="absolute -right-16 -top-16 size-64 rounded-full bg-white/10 blur-2xl"
            />
            <div className="relative z-10 flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
              <div className="max-w-xl">
                <span className="inline-block rounded-full bg-white/20 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-white">
                  Prueba 30 días gratis
                </span>
                <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{h.ctaBandTitle}</h2>
                <p className="mt-2 text-base text-white/90">{h.ctaBandBody}</p>
              </div>
              <LinkButton
                to={pathFor("signUp", site.lang)}
                size="lg"
                variant="secondary"
                className="whitespace-nowrap border-transparent bg-white text-primary shadow-lg hover:bg-surface-2"
                data-umami-event="sign_up_started"
              >
                {h.ctaPrimary}
              </LinkButton>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
