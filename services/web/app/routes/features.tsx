import { pathFor } from "@mcet/i18n";
import { BellRing, CalendarClock, CalendarSync, Check, ShieldCheck, Smartphone, Users } from "lucide-react";
import { Container, LinkButton } from "~/components/ui";
import { useRoot } from "~/lib/i18n";
import { metaFor, publicCacheHeaders } from "~/lib/seo";
import type { Route } from "./+types/features";

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({
    title: t.public.features.seoTitle,
    description: t.public.features.seoDescription,
  }));

export const headers = () => publicCacheHeaders;

const ICONS = [CalendarClock, Smartphone, ShieldCheck, Users, BellRing, CalendarSync];

export default function Features() {
  const { site, t } = useRoot();
  const f = t.public.features;
  return (
    <Container className="py-14 sm:py-20">
      <header className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight">{f.title}</h1>
        <p className="mt-4 text-lg text-muted">{f.lead}</p>
      </header>
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {f.groups.map((g, i) => {
          const Icon = ICONS[i] ?? Check;
          return (
            <section
              key={g.title}
              aria-labelledby={`grupo-${i}`}
              className="rounded-[var(--radius-card)] border border-border bg-surface p-6"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-[var(--radius-field)] bg-primary-soft text-primary">
                  <Icon aria-hidden className="size-5" />
                </span>
                <h2 id={`grupo-${i}`} className="text-xl font-semibold">
                  {g.title}
                </h2>
              </div>
              <ul className="mt-5 space-y-2.5">
                {g.items.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <Check aria-hidden className="mt-1 size-4 shrink-0 text-success" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <div className="mt-12">
        <LinkButton to={pathFor("signUp", site.lang)} size="lg" data-umami-event="sign_up_started">
          {t.public.home.ctaPrimary}
        </LinkButton>
      </div>
    </Container>
  );
}
