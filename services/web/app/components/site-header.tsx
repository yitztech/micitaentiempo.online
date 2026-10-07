import { pathFor, type RouteId } from "@mcet/i18n";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { cx, useRoot } from "~/lib/i18n";
import { LanguageLink } from "./language-link";
import { Logo } from "./logo";
import { buttonClass, Container, LinkButton } from "./ui";

const NAV: Array<{ id: RouteId; key: "features" | "pricing" | "faq" | "connectAi" }> = [
  { id: "features", key: "features" },
  { id: "pricing", key: "pricing" },
  { id: "connectAi", key: "connectAi" },
  { id: "faq", key: "faq" },
];

export function SiteHeader() {
  const { site, t, hasSession } = useRoot();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: cerrar el menú al cambiar de página
  useEffect(() => setOpen(false), [pathname]);
  const n = t.common.nav;
  const links = NAV.map(({ id, key }) => (
    <NavLink
      key={id}
      to={pathFor(id, site.lang)}
      className={({ isActive }) =>
        cx(
          "inline-flex min-h-11 items-center rounded-[var(--radius-field)] px-3 text-[15px] hover:bg-surface-2",
          isActive && "font-semibold text-primary",
        )
      }
    >
      {n[key]}
    </NavLink>
  ));
  const account = hasSession ? (
    <LinkButton to={pathFor("dashboard", site.lang)}>{n.dashboard}</LinkButton>
  ) : (
    <>
      <NavLink to={pathFor("signIn", site.lang)} className={buttonClass("ghost")}>
        {n.signIn}
      </NavLink>
      <LinkButton to={pathFor("signUp", site.lang)} data-umami-event="sign_up_started">
        {n.signUp}
      </LinkButton>
    </>
  );
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        {n.skipToContent}
      </a>
      <Container className="flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav aria-label={n.main} className="hidden items-center gap-1 lg:flex">
          {links}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <LanguageLink />
          {account}
        </div>
        <button
          type="button"
          className="inline-flex size-11 items-center justify-center rounded-[var(--radius-field)] hover:bg-surface-2 lg:hidden"
          aria-expanded={open}
          aria-controls="menu-movil"
          aria-label={open ? n.closeMenu : n.openMenu}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X aria-hidden className="size-6" /> : <Menu aria-hidden className="size-6" />}
        </button>
      </Container>
      <div id="menu-movil" hidden={!open} className="border-t border-border bg-background lg:hidden">
        <Container className="flex flex-col gap-1 py-4">
          <nav aria-label={n.main} className="flex flex-col gap-1">
            {links}
          </nav>
          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-4">
            {account}
            <LanguageLink className="justify-center" />
          </div>
        </Container>
      </div>
    </header>
  );
}
