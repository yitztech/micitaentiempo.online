import { pathFor } from "@mcet/i18n";
import {
  BellRing,
  CalendarCheck2,
  CalendarSync,
  CheckCircle2,
  Clock3,
  Globe2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge, Card, Container, LinkButton } from "~/components/ui";
import { useRoot } from "~/lib/i18n";
import { metaFor, publicCacheHeaders } from "~/lib/seo";
import type { Route } from "./+types/home";

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.public.home.seoTitle, description: t.public.home.seoDescription }));

export const headers = () => publicCacheHeaders;

const ICONS = [CalendarCheck2, ShieldCheck, Globe2, Clock3, CalendarSync, Sparkles];

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

/** Vista previa de la página de reserva (HTML, sin imágenes). */
function BookingPreview() {
  const { t } = useRoot();
  const h = t.public.home;
  return (
    <Card className="relative mx-auto w-full max-w-sm p-5" role="img" aria-label={h.previewLabel}>
      <div aria-hidden>
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
            <CalendarCheck2 className="size-5" />
          </span>
          <div>
            <p className="font-semibold">{t.common.site.name}</p>
            <p className="text-sm text-muted">{h.previewService}</p>
          </div>
        </div>
        <p className="mt-5 text-sm font-medium text-muted">{h.previewDay}</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {h.previewTimes.map((time, i) => (
            <span
              key={time}
              className={
                i === 2
                  ? "rounded-[var(--radius-field)] bg-primary py-2.5 text-center text-sm font-semibold text-on-primary tabular"
                  : "rounded-[var(--radius-field)] border border-border py-2.5 text-center text-sm tabular"
              }
            >
              {time}
            </span>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-2 rounded-[var(--radius-field)] bg-success-soft px-3 py-2.5 text-sm font-medium">
          <CheckCircle2 className="size-4 text-success" />
          {h.previewConfirm}
        </div>
      </div>
      <span
        aria-hidden
        className="absolute -right-3 -top-3 -z-10 size-24 rounded-full bg-accent/40 blur-2xl"
      />
      <span
        aria-hidden
        className="absolute -bottom-6 -left-6 -z-10 size-32 rounded-full bg-secondary/30 blur-2xl"
      />
    </Card>
  );
}

export default function Home() {
  const { site, t } = useRoot();
  const h = t.public.home;
  return (
    <>
      <StructuredData />
      <section className="overflow-hidden">
        <Container className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div>
            <Badge>
              <BellRing aria-hidden className="size-4" />
              {h.eyebrow}
            </Badge>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">{h.title}</h1>
            <p className="mt-5 max-w-xl text-lg text-muted">{h.lead}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <LinkButton to={pathFor("signUp", site.lang)} size="lg" data-umami-event="sign_up_started">
                {h.ctaPrimary}
              </LinkButton>
              <LinkButton to={pathFor("pricing", site.lang)} size="lg" variant="secondary">
                {h.ctaSecondary}
              </LinkButton>
            </div>
            <p className="mt-4 text-sm text-muted">{h.trialNote}</p>
          </div>
          <BookingPreview />
        </Container>
      </section>

      <section aria-labelledby="destacados" className="bg-surface py-16 sm:py-20">
        <Container>
          <h2 id="destacados" className="max-w-2xl text-3xl font-semibold tracking-tight">
            {h.highlightsTitle}
          </h2>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {h.highlights.map((item, i) => {
              const Icon = ICONS[i] ?? Sparkles;
              return (
                <li
                  key={item.title}
                  className="rounded-[var(--radius-card)] border border-border bg-background p-6"
                >
                  <span className="flex size-10 items-center justify-center rounded-[var(--radius-field)] bg-primary-soft text-primary">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-muted">{item.body}</p>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="pasos" className="py-16 sm:py-20">
        <Container>
          <h2 id="pasos" className="text-3xl font-semibold tracking-tight">
            {h.stepsTitle}
          </h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {h.steps.map((step, i) => (
              <li key={step.title} className="relative">
                <span
                  className="flex size-10 items-center justify-center rounded-full bg-primary text-lg font-semibold text-on-primary tabular"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section aria-labelledby="para-quien" className="py-4">
        <Container>
          <h2 id="para-quien" className="text-2xl font-semibold tracking-tight">
            {h.audienceTitle}
          </h2>
          <ul className="mt-6 flex flex-wrap gap-2">
            {h.audience.map((a) => (
              <li key={a} className="rounded-full border border-border bg-surface px-4 py-2 text-[15px]">
                {a}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="pt-16 sm:pt-20">
        <Container>
          <div className="flex flex-col items-start justify-between gap-6 rounded-[var(--radius-card)] bg-primary px-6 py-10 text-on-primary sm:flex-row sm:items-center sm:px-10">
            <div>
              <h2 className="text-2xl font-semibold">{h.ctaBandTitle}</h2>
              <p className="mt-2 opacity-90">{h.ctaBandBody}</p>
            </div>
            <LinkButton
              to={pathFor("signUp", site.lang)}
              size="lg"
              variant="secondary"
              className="border-transparent bg-surface text-text hover:bg-surface-2"
              data-umami-event="sign_up_started"
            >
              {h.ctaPrimary}
            </LinkButton>
          </div>
        </Container>
      </section>
    </>
  );
}
