import { interpolate, pathFor, type RouteId } from "@mcet/i18n";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { customerSession } from "~/lib/customer";
import { useRoot } from "~/lib/i18n";
import { LanguageLink } from "./language-link";
import { LogoMark } from "./logo";
import { Container } from "./ui";

export function SiteFooter() {
  const { site, t, hasSession } = useRoot();
  const [hasCustomer, setHasCustomer] = useState(false);

  useEffect(() => {
    setHasCustomer(Boolean(customerSession()));
  }, []);

  const isLoggedIn = hasSession || hasCustomer;
  const f = t.common.footer;
  const n = t.common.nav;
  const col = (title: string, items: Array<[RouteId, string]>) => (
    <div>
      <h2 className="text-sm font-bold tracking-tight text-text">{title}</h2>
      <ul className="mt-3 space-y-1">
        {items.map(([id, label]) => (
          <li key={id}>
            <Link
              to={pathFor(id, site.lang)}
              className="inline-flex min-h-9 items-center text-[15px] text-muted transition-colors hover:text-primary"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
  const productLinks: Array<[RouteId, string]> = [
    ["features", n.features],
    ["pricing", n.pricing],
    ["connectAi", n.connectAi],
    ["downloadApp", n.downloadApp],
    ["faq", n.faq],
    ["contact", n.contact],
    ...(isLoggedIn ? ([["myAppointments", n.myAppointments]] as Array<[RouteId, string]>) : []),
  ];
  return (
    <footer className="mt-24 border-t border-border/80 bg-surface">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-2">
          <div className="flex items-center gap-2.5 text-[18px] font-extrabold tracking-tight text-text">
            <LogoMark className="size-9" />
            {t.common.site.name}
          </div>
          <p className="mt-3.5 max-w-sm text-[15px] leading-relaxed text-muted">{f.madeFor}</p>
          <LanguageLink className="-ml-2 mt-4" />
        </div>
        {col(f.product, productLinks)}
        {col(f.legal, [
          ["privacy", f.privacy],
          ["terms", f.terms],
          ["credits", f.credits],
        ])}
      </Container>
      <Container className="border-t border-border/70 py-6 text-sm text-muted">
        {interpolate(f.rights, { year: new Date().getFullYear() })}
      </Container>
    </footer>
  );
}
