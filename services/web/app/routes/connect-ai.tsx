import { pathFor } from "@mcet/i18n";
import { Bot, MessageSquareText, ShieldCheck } from "lucide-react";
import { Card, Container, LinkButton } from "~/components/ui";
import { useRoot } from "~/lib/i18n";
import { metaFor, publicCacheHeaders } from "~/lib/seo";
import type { Route } from "./+types/connect-ai";

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({
    title: t.public.connectAi.seoTitle,
    description: t.public.connectAi.seoDescription,
  }));

export const headers = () => publicCacheHeaders;

export default function ConnectAi() {
  const { site, t } = useRoot();
  const c = t.public.connectAi;
  return (
    <Container className="py-14 sm:py-20">
      <header className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight">{c.title}</h1>
        <p className="mt-4 text-lg text-muted">{c.lead}</p>
      </header>
      <section aria-labelledby="asistentes" className="mt-12">
        <h2 id="asistentes" className="text-2xl font-semibold">
          {c.assistantsTitle}
        </h2>
        <ul className="mt-6 grid gap-5 md:grid-cols-3">
          {c.assistants.map((a) => (
            <li key={a.name}>
              <Card className="h-full p-6">
                <Bot aria-hidden className="size-6 text-primary" />
                <h3 className="mt-3 text-lg font-semibold">{a.name}</h3>
                <p className="mt-2 text-muted">{a.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="ejemplos"
          className="rounded-[var(--radius-card)] border border-border bg-surface p-6"
        >
          <h2 id="ejemplos" className="flex items-center gap-2 text-xl font-semibold">
            <MessageSquareText aria-hidden className="size-5 text-primary" />
            {c.examplesTitle}
          </h2>
          <ul className="mt-5 space-y-3">
            {c.examples.map((e) => (
              <li key={e} className="rounded-[var(--radius-field)] bg-surface-2 px-4 py-3">
                “{e}”
              </li>
            ))}
          </ul>
        </section>
        <section
          aria-labelledby="seguridad"
          className="rounded-[var(--radius-card)] border border-border bg-surface p-6"
        >
          <h2 id="seguridad" className="flex items-center gap-2 text-xl font-semibold">
            <ShieldCheck aria-hidden className="size-5 text-primary" />
            {c.safetyTitle}
          </h2>
          <p className="mt-4 text-muted">{c.safety}</p>
          <p className="mt-4 text-sm text-muted">{c.soon}</p>
          <LinkButton to={pathFor("signUp", site.lang)} className="mt-6" data-umami-event="sign_up_started">
            {t.public.home.ctaPrimary}
          </LinkButton>
        </section>
      </div>
    </Container>
  );
}
