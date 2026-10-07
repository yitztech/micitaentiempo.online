import { pathFor } from "@mcet/i18n";
import { Check, Info } from "lucide-react";
import { Badge, Card, Container, LinkButton } from "~/components/ui";
import { useRoot } from "~/lib/i18n";
import { metaFor, publicCacheHeaders } from "~/lib/seo";
import type { Route } from "./+types/pricing";

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.public.pricing.seoTitle, description: t.public.pricing.seoDescription }));

export const headers = () => publicCacheHeaders;

export default function Pricing() {
  const { site, t, features } = useRoot();
  const p = t.public.pricing;
  const plans = [
    { key: "personal", plan: p.plans.personal, featured: false },
    { key: "branches", plan: p.plans.branches, featured: true },
  ] as const;
  return (
    <Container className="py-14 sm:py-20">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight">{p.title}</h1>
        <p className="mt-4 text-lg text-muted">{p.lead}</p>
      </header>
      <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
        {plans.map(({ key, plan, featured }) => (
          <Card key={key} className={featured ? "relative border-primary p-7 ring-1 ring-primary" : "p-7"}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">{plan.name}</h2>
              <Badge>{p.trialBadge}</Badge>
            </div>
            <p className="mt-2 text-muted">{plan.description}</p>
            <p className="mt-6 flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight tabular">{plan.price}</span>
              <span className="text-muted">{p.perMonth}</span>
            </p>
            <ul className="mt-6 space-y-2.5">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <Check aria-hidden className="mt-1 size-4 shrink-0 text-success" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <LinkButton
              to={`${pathFor("signUp", site.lang)}?plan=${key}`}
              variant={featured ? "primary" : "secondary"}
              size="lg"
              className="mt-8 w-full"
              data-umami-event="sign_up_started"
            >
              {p.choose}
            </LinkButton>
          </Card>
        ))}
      </div>
      <div className="mx-auto mt-6 max-w-4xl space-y-2 text-center text-sm text-muted">
        <p>{p.currencyNote}</p>
        {features.stripe ? null : (
          <p className="inline-flex items-center gap-1.5">
            <Info aria-hidden className="size-4" />
            {p.billingSoon}
          </p>
        )}
      </div>
      <section aria-labelledby="faq-precios" className="mx-auto mt-16 max-w-3xl">
        <h2 id="faq-precios" className="text-2xl font-semibold">
          {p.faqTitle}
        </h2>
        <dl className="mt-6 divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
          {p.faq.map((item) => (
            <div key={item.q} className="p-5">
              <dt className="font-semibold">{item.q}</dt>
              <dd className="mt-1.5 text-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Container>
  );
}
