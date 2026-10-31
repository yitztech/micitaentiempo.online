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
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{f.title}</h1>
        <p className="mt-4 text-lg text-muted">{f.lead}</p>
      </header>
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {f.groups.map((g, i) => {
          const Icon = ICONS[i] ?? Check;
          return (
            <section
              key={g.title}
              aria-labelledby={`grupo-${i}`}
              className="rounded-[var(--radius-card)] border border-border/80 bg-surface p-7 shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-pop)]"
            >
              <div className="flex items-center gap-3.5">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <Icon aria-hidden className="size-6" />
                </span>
                <h2 id={`grupo-${i}`} className="text-xl font-bold">
                  {g.title}
                </h2>
              </div>
              <ul className="mt-5 space-y-3">
                {g.items.map((item) => (
                  <li key={item} className="flex gap-2.5 text-[15px]">
                    <Check aria-hidden className="mt-1 size-4 shrink-0 text-success" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <div className="mt-12 text-center">
        <LinkButton to={pathFor("signUp", site.lang)} size="lg" data-umami-event="sign_up_started">
          {t.public.home.ctaPrimary}
        </LinkButton>
      </div>
    </Container>
  );
}
