import { interpolate, pathFor, type RouteId } from "@mcet/i18n";
import { Link } from "react-router";
import { useRoot } from "~/lib/i18n";
import { LanguageLink } from "./language-link";
import { LogoMark } from "./logo";
import { Container } from "./ui";

export function SiteFooter() {
  const { site, t } = useRoot();
  const f = t.common.footer;
  const n = t.common.nav;
  const col = (title: string, items: Array<[RouteId, string]>) => (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-3 space-y-1">
        {items.map(([id, label]) => (
          <li key={id}>
            <Link
              to={pathFor(id, site.lang)}
              className="inline-flex min-h-9 items-center text-[15px] text-muted hover:text-text"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <footer className="mt-24 border-t border-border bg-surface">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-2">
          <div className="flex items-center gap-2.5 font-semibold">
            <LogoMark />
            {t.common.site.name}
          </div>
          <p className="mt-3 max-w-sm text-[15px] text-muted">{f.madeFor}</p>
          <LanguageLink className="-ml-2 mt-4" />
        </div>
        {col(f.product, [
          ["features", n.features],
          ["pricing", n.pricing],
          ["connectAi", n.connectAi],
          ["faq", n.faq],
          ["contact", n.contact],
          ["myAppointments", n.myAppointments],
        ])}
        {col(f.legal, [
          ["privacy", f.privacy],
          ["terms", f.terms],
          ["credits", f.credits],
        ])}
      </Container>
      <Container className="border-t border-border py-6 text-sm text-muted">
        {interpolate(f.rights, { year: new Date().getFullYear() })}
      </Container>
    </footer>
  );
}
