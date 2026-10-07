import { Check, CreditCard, FileText } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { data, useRevalidator } from "react-router";
import { Alert, Badge, Button, Card } from "~/components/ui";
import { apiRequest, errorText } from "~/lib/api-client";
import { nonceContext } from "~/lib/context";
import { cx, fmt, useRoot } from "~/lib/i18n";
import { panelGet } from "~/lib/panel.server";
import { contentSecurityPolicy } from "~/lib/security.server";
import { metaFor } from "~/lib/seo";
import type { Route } from "./+types/billing";

interface Billing {
  enabled: boolean;
  publishableKey: string | null;
  plan: "personal" | "branches";
  status: "trialing" | "active" | "past_due" | "read_only" | "suspended";
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasSubscription: boolean;
  limits: { calendars: number; membersPerCalendar: number };
}
interface Invoice {
  id: string;
  number: string | null;
  status: string | null;
  total: number;
  currency: string;
  created: string;
  pdf: string | null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const billing = await panelGet<Billing>(request, context, "/api/v1/billing");
  const invoices = billing.enabled
    ? await panelGet<Invoice[]>(request, context, "/api/v1/billing/invoices").catch(() => [])
    : [];
  const headers = new Headers();
  if (billing.enabled) {
    // Stripe solo amplía la CSP y Permissions-Policy de esta página, y solo si está activo.
    headers.set(
      "Content-Security-Policy",
      contentSecurityPolicy(context.get(nonceContext), { stripe: true }),
    );
    headers.set(
      "Permissions-Policy",
      'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")',
    );
  }
  return data({ billing, invoices }, { headers });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  const out: Record<string, string> = {};
  for (const k of ["Content-Security-Policy", "Permissions-Policy"]) {
    const v = loaderHeaders.get(k);
    if (v) out[k] = v;
  }
  return out;
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.panel.billing.seoTitle, indexable: false }));

type StripeJs = Awaited<ReturnType<typeof import("@stripe/stripe-js")["loadStripe"]>>;

export default function BillingPage({ loaderData }: Route.ComponentProps) {
  const { site, t } = useRoot();
  const b = t.panel.billing;
  const { billing, invoices } = loaderData;
  const revalidator = useRevalidator();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<"personal" | "branches" | null>(null);
  const [paying, setPaying] = useState(false);
  const checkoutRef = useRef<HTMLDivElement>(null);
  const paymentRef = useRef<HTMLDivElement>(null);
  const date = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(site.lang === "es" ? "es-MX" : "en-US", { dateStyle: "long" }).format(
          new Date(iso),
        )
      : "";
  const errors = useMemo(() => ({ ...t.panel.errors, ...b.errors }), [t.panel.errors, b.errors]);
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) setMsg({ ok: true, text: ok });
      void revalidator.revalidate();
    } catch (err) {
      setMsg({ ok: false, text: errorText(errors, err) });
    }
  };

  // Embedded Checkout de Stripe (solo con Stripe activo; el script se carga al pedirlo).
  useEffect(() => {
    if (!checkoutPlan || !billing.publishableKey) return;
    let destroy: (() => void) | undefined;
    void (async () => {
      const { loadStripe } = await import("@stripe/stripe-js");
      const stripe: StripeJs = await loadStripe(billing.publishableKey ?? "");
      if (!stripe || !checkoutRef.current) return;
      const checkout = await stripe.createEmbeddedCheckoutPage({
        fetchClientSecret: async () =>
          (
            await apiRequest<{ clientSecret: string }>("POST", "/api/v1/billing/checkout", {
              plan: checkoutPlan,
            })
          ).clientSecret,
      });
      checkout.mount(checkoutRef.current);
      destroy = () => checkout.destroy();
    })().catch((err) => setMsg({ ok: false, text: errorText(errors, err) }));
    return () => destroy?.();
  }, [checkoutPlan, billing.publishableKey, errors]);

  async function startPaymentMethod() {
    setPaying(true);
    const { loadStripe } = await import("@stripe/stripe-js");
    const stripe: StripeJs = await loadStripe(billing.publishableKey ?? "");
    const { clientSecret } = await apiRequest<{ clientSecret: string }>(
      "POST",
      "/api/v1/billing/setup-intent",
    );
    if (!stripe || !paymentRef.current) return;
    const elements = stripe.elements({ clientSecret, locale: site.lang });
    const el = elements.create("payment");
    el.mount(paymentRef.current);
    paymentRef.current.dataset.ready = "1";
    (paymentRef.current as HTMLDivElement & { confirm?: () => Promise<void> }).confirm = async () => {
      const res = await stripe.confirmSetup({ elements, redirect: "if_required" });
      setMsg(
        res.error
          ? { ok: false, text: res.error.message ?? errors.generic }
          : { ok: true, text: b.paymentSaved },
      );
    };
  }

  const plans = (["personal", "branches"] as const).map((k) => ({ k, info: t.public.pricing.plans[k] }));
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">{b.title}</h1>
      {msg ? <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert> : null}

      <Card className="p-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">{b.plan}</dt>
            <dd className="text-lg font-semibold">{t.public.pricing.plans[billing.plan].name}</dd>
            <dd className="text-sm text-muted">
              {fmt(b.limits, {
                calendars: billing.limits.calendars,
                members: billing.limits.membersPerCalendar,
              })}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">{b.status}</dt>
            <dd className="text-lg font-semibold">{b.statuses[billing.status]}</dd>
            <dd className="text-sm text-muted">
              {billing.status === "trialing"
                ? billing.enabled && billing.trialEndsAt
                  ? fmt(b.trialDays, { date: date(billing.trialEndsAt) })
                  : b.trialNoEnd
                : billing.cancelAtPeriodEnd
                  ? fmt(b.cancelScheduled, { date: date(billing.currentPeriodEnd) })
                  : billing.currentPeriodEnd
                    ? fmt(b.renews, { date: date(billing.currentPeriodEnd) })
                    : ""}
            </dd>
          </div>
        </dl>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {plans.map(({ k, info }) => {
          const current = billing.plan === k;
          return (
            <Card key={k} className={cx("p-6", current && "border-primary ring-1 ring-primary")}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">{info.name}</h2>
                {current ? <Badge>{b.current}</Badge> : null}
              </div>
              <p className="mt-2 text-muted">{info.description}</p>
              <p className="mt-4 text-3xl font-semibold tabular">
                {info.price}
                <span className="ml-1 text-base font-normal text-muted">{t.public.pricing.perMonth}</span>
              </p>
              <ul className="mt-4 space-y-2">
                {info.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check aria-hidden className="mt-1 size-4 shrink-0 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap gap-2">
                {!billing.enabled ? (
                  <Button disabled aria-disabled>
                    {b.soon}
                  </Button>
                ) : !billing.hasSubscription || billing.status === "read_only" ? (
                  <Button onClick={() => setCheckoutPlan(k)} data-umami-event="checkout_started">
                    {b.subscribe}
                  </Button>
                ) : null}
                {!current ? (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void run(() => apiRequest("POST", "/api/v1/billing/change-plan", { plan: k }))
                    }
                  >
                    {fmt(b.changeTo, { plan: info.name })}
                  </Button>
                ) : null}
              </div>
              {!current && k === "personal" ? (
                <p className="mt-3 text-sm text-muted">{b.downgradeHint}</p>
              ) : null}
            </Card>
          );
        })}
      </div>

      {checkoutPlan ? (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">{b.checkoutTitle}</h2>
          <div ref={checkoutRef} className="mt-4" />
        </Card>
      ) : null}

      {billing.enabled && billing.hasSubscription ? (
        <Card className="space-y-4 p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CreditCard aria-hidden className="size-5 text-primary" />
            {b.paymentMethod}
          </h2>
          <div ref={paymentRef} />
          {paying ? (
            <Button
              onClick={() =>
                void (
                  paymentRef.current as (HTMLDivElement & { confirm?: () => Promise<void> }) | null
                )?.confirm?.()
              }
            >
              {b.savePayment}
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() =>
                void startPaymentMethod().catch((err) => setMsg({ ok: false, text: errorText(errors, err) }))
              }
            >
              {b.updatePayment}
            </Button>
          )}
          <div className="border-t border-border pt-4">
            {billing.cancelAtPeriodEnd ? (
              <Button
                variant="secondary"
                onClick={() => void run(() => apiRequest("POST", "/api/v1/billing/resume"))}
              >
                {b.resume}
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  className="text-danger"
                  onClick={() => void run(() => apiRequest("POST", "/api/v1/billing/cancel"))}
                >
                  {b.cancel}
                </Button>
                <p className="mt-1 text-sm text-muted">
                  {fmt(b.cancelHint, { date: date(billing.currentPeriodEnd) })}
                </p>
              </>
            )}
          </div>
        </Card>
      ) : null}

      {billing.enabled ? (
        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FileText aria-hidden className="size-5 text-primary" />
            {b.invoices}
          </h2>
          {invoices.length === 0 ? (
            <p className="mt-3 text-muted">{b.noInvoices}</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {invoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span>
                    {i.number ?? i.id} · {date(i.created)} ·{" "}
                    {new Intl.NumberFormat(site.lang === "es" ? "es-MX" : "en-US", {
                      style: "currency",
                      currency: i.currency.toUpperCase(),
                    }).format(i.total / 100)}
                  </span>
                  {i.pdf ? (
                    <a
                      href={i.pdf}
                      target="_blank"
                      rel="noopener"
                      className="text-primary underline underline-offset-2"
                    >
                      {b.download}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
