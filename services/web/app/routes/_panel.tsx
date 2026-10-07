import { pathFor } from "@mcet/i18n";
import { Bell, BellRing, CalendarDays, Home, LogOut, Menu, Plus, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useRouteLoaderData } from "react-router";
import { LanguageLink } from "~/components/language-link";
import { Logo } from "~/components/logo";
import { NotificationBell } from "~/components/notification-bell";
import { postJson } from "~/lib/api-client";
import { cx, useRoot } from "~/lib/i18n";
import { panelGet, panelGetOptional } from "~/lib/panel.server";
import type { BoardView, Me, Org } from "~/lib/panel-types";
import type { Route } from "./+types/_panel";

export async function loader({ request, context }: Route.LoaderArgs) {
  const [me, calendars, org] = await Promise.all([
    panelGet<Me>(request, context, "/api/v1/me"),
    panelGet<BoardView[]>(request, context, "/api/v1/calendars"),
    panelGetOptional<Org>(request, context, "/api/v1/org"),
  ]);
  return { me, calendars, org };
}

export type PanelData = Awaited<ReturnType<typeof loader>>;

export function usePanel(): PanelData {
  const d = useRouteLoaderData<typeof loader>("routes/_panel");
  if (!d) throw new Error("Sin datos del panel");
  return d;
}

const item = ({ isActive }: { isActive: boolean }) =>
  cx(
    "flex min-h-11 items-center gap-3 rounded-[var(--radius-field)] px-3 text-[15px] hover:bg-surface-2",
    isActive && "bg-primary-soft font-semibold text-primary",
  );

/** Panel del personal: barra lateral en escritorio y cajón en móvil. */
export default function PanelLayout({ loaderData }: Route.ComponentProps) {
  const { site, t } = useRoot();
  const p = t.panel;
  const { me, calendars, org } = loaderData;
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: cerrar el cajón al navegar
  useEffect(() => setOpen(false), [pathname]);
  const staff = calendars.some((c) => c.role === "owner" || c.role === "editor");

  async function signOut() {
    await postJson("/api/auth/sign-out", {}).catch(() => undefined);
    window.location.assign(pathFor("home", site.lang));
  }

  const nav = (
    <nav aria-label={p.nav.label} className="flex flex-1 flex-col gap-1">
      <NavLink to={pathFor("dashboard", site.lang)} end className={item}>
        <Home aria-hidden className="size-5" />
        {p.nav.home}
      </NavLink>
      <p className="mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-muted">{p.nav.calendars}</p>
      {calendars.map((c) => (
        <NavLink key={c.id} to={pathFor("calendar", site.lang, { id: c.id })} className={item}>
          <CalendarDays aria-hidden className="size-5" />
          <span className="truncate">{c.name}</span>
        </NavLink>
      ))}
      {org && calendars.filter((c) => c.role === "owner").length < org.limits.calendars ? (
        <NavLink to={pathFor("welcome", site.lang)} className={item}>
          <Plus aria-hidden className="size-5" />
          {p.nav.newCalendar}
        </NavLink>
      ) : null}
      <NavLink to={pathFor("inbox", site.lang)} className={(a) => cx("mt-4", item(a))}>
        <Bell aria-hidden className="size-5" />
        {p.nav.inbox}
      </NavLink>
      <NavLink to={pathFor("notificationSettings", site.lang)} className={item}>
        <BellRing aria-hidden className="size-5" />
        {p.nav.notificationSettings}
      </NavLink>
      {staff ? (
        <NavLink to={pathFor("customers", site.lang)} className={item}>
          <Users aria-hidden className="size-5" />
          {p.nav.customers}
        </NavLink>
      ) : null}
    </nav>
  );

  const footer = (
    <div className="mt-6 border-t border-border pt-4">
      <p className="truncate px-3 text-sm font-medium">{me.name || me.email}</p>
      <p className="truncate px-3 text-xs text-muted">{me.email}</p>
      <div className="mt-2 flex flex-col">
        <LanguageLink />
        <button type="button" onClick={() => void signOut()} className={item({ isActive: false })}>
          <LogOut aria-hidden className="size-5" />
          {p.nav.signOut}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        {t.common.nav.skipToContent}
      </a>
      <aside className="hidden border-r border-border bg-surface lg:flex lg:min-h-dvh lg:flex-col lg:p-4">
        <div className="mb-6 px-1">
          <Logo />
        </div>
        {nav}
        {footer}
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-3 backdrop-blur lg:justify-end lg:px-6">
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-[var(--radius-field)] hover:bg-surface-2 lg:hidden"
            aria-expanded={open}
            aria-controls="panel-cajon"
            aria-label={open ? t.common.nav.closeMenu : p.nav.menu}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X aria-hidden className="size-6" /> : <Menu aria-hidden className="size-6" />}
          </button>
          <div className="lg:hidden">
            <Logo />
          </div>
          <NotificationBell />
        </header>
        <div id="panel-cajon" hidden={!open} className="border-b border-border bg-surface p-4 lg:hidden">
          {nav}
          {footer}
        </div>
        <main id="contenido" className="mx-auto w-full max-w-6xl p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
