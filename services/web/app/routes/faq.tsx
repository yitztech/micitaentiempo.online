import { pathFor } from "@mcet/i18n";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router";
import { Container } from "~/components/ui";
import { useRoot } from "~/lib/i18n";
import { metaFor, publicCacheHeaders } from "~/lib/seo";
import type { Route } from "./+types/faq";

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.public.faq.seoTitle, description: t.public.faq.seoDescription }));

export const headers = () => publicCacheHeaders;

export default function Faq() {
  const { site, t, nonce } = useRoot();
  const f = t.public.faq;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: f.items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
  return (
    <Container className="max-w-3xl py-14 sm:py-20">
      <script
        type="application/ld+json"
        nonce={nonce}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON propio, con < escapado
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <h1 className="text-4xl font-semibold tracking-tight">{f.title}</h1>
      <p className="mt-4 text-lg text-muted">
        {f.lead}{" "}
        <Link to={pathFor("contact", site.lang)} className="text-primary underline underline-offset-4">
          {t.common.nav.contact}
        </Link>
      </p>
      <div className="mt-10 divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
        {f.items.map((item) => (
          <details key={item.q} className="group p-5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
              {item.q}
              <ChevronDown aria-hidden className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-2 text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </Container>
  );
}
