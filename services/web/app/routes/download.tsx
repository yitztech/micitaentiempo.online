import { Download, Globe, ShieldCheck, Smartphone } from "lucide-react";
import { Badge, buttonClass, Card, Container } from "~/components/ui";
import { useRoot } from "~/lib/i18n";
import { metaFor, publicCacheHeaders } from "~/lib/seo";
import type { Route } from "./+types/download";

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({
    title: t.public.downloadApp.seoTitle,
    description: t.public.downloadApp.seoDescription,
  }));

export const headers = () => publicCacheHeaders;

const FEATURE_ICONS = [Smartphone, Globe, ShieldCheck];

export default function DownloadPage() {
  const { t } = useRoot();
  const d = t.public.downloadApp;

  return (
    <Container className="py-14 sm:py-20">
      <header className="mx-auto max-w-2xl text-center">
        <Badge className="mb-4">Android APK</Badge>
        <h1 className="text-4xl font-semibold tracking-tight">{d.title}</h1>
        <p className="mt-4 text-lg text-muted">{d.lead}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3">
          <a
            href="/app.apk"
            download="micitaentiempo.apk"
            className={buttonClass("primary", "lg", "gap-2 text-base px-6 py-3")}
            data-testid="download-apk-button"
          >
            <Download className="size-5" />
            {d.downloadApk}
          </a>
          <p className="text-xs text-muted">
            {d.version} · {d.requirements}
          </p>
        </div>
      </header>

      <section aria-labelledby="app-features" className="mt-16">
        <h2 id="app-features" className="text-center text-2xl font-semibold">
          {d.featuresTitle}
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {d.features.map((feature, idx) => {
            const Icon = FEATURE_ICONS[idx % FEATURE_ICONS.length] ?? Smartphone;
            return (
              <Card key={feature.title} className="p-6">
                <Icon aria-hidden className="size-6 text-primary" />
                <h3 className="mt-3 text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-muted text-sm">{feature.body}</p>
              </Card>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="installation-guide" className="mt-16">
        <Card className="mx-auto max-w-3xl p-8">
          <h2 id="installation-guide" className="text-xl font-semibold">
            {d.stepsTitle}
          </h2>
          <ol className="mt-6 list-decimal space-y-4 pl-5 text-[15px] text-muted">
            {d.steps.map((step) => (
              <li key={step} className="leading-relaxed">
                <span className="text-text">{step}</span>
              </li>
            ))}
          </ol>
        </Card>
      </section>
    </Container>
  );
}
