import { ChevronsUpDown } from "lucide-react";
import { Link, useMatch } from "react-router";
import { Avatar } from "@/components/ui/avatar";
import { Logo, LogoMark } from "@/components/ui/logo";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type PanelItem, panelItems } from "./dashboard-nav";

function SidebarLink({ it }: { it: PanelItem }) {
  const active = !!useMatch({ path: it.to, end: it.end ?? false });
  return (
    <Tooltip label={it.label}>
      <Link
        to={it.to}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex min-h-11 items-center justify-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors lg:justify-start",
          active ? "bg-primary-50 text-primary" : "text-ink/80 hover:bg-primary-50/60 hover:text-primary",
        )}
      >
        <it.icon className="size-5 shrink-0" aria-hidden />
        <span className="truncate max-lg:sr-only">{it.label}</span>
        {it.badge ? (
          <span className="absolute right-2 top-1.5 grid size-5 place-items-center rounded-full bg-danger text-[11px] font-bold text-white lg:static lg:ml-auto lg:size-6 lg:text-xs">
            {it.badge}
            <span className="sr-only"> sin leer</span>
          </span>
        ) : null}
      </Link>
    </Tooltip>
  );
}

/** Barra lateral: completa desde 1024 px, solo iconos en tablet, oculta en móvil (ahí hay navegación inferior). */
export function DashboardSidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col border-r border-line/70 bg-surface px-3 py-5 md:flex lg:w-[264px] lg:px-4">
      <div className="px-1 lg:px-2">
        <span className="lg:hidden">
          <Link to="/panel" aria-label="Mi Cita en Tiempo, panel">
            <LogoMark className="mx-auto size-11" />
          </Link>
        </span>
        <span className="hidden lg:block">
          <Logo to="/panel" />
        </span>
      </div>
      <nav aria-label="Panel" className="mt-6 flex-1 space-y-1 overflow-y-auto">
        {panelItems.map((it) => (
          <SidebarLink key={it.to} it={it} />
        ))}
      </nav>
      <Link to="/panel/cuenta" className="mt-3 flex items-center gap-3 rounded-xl p-2 hover:bg-primary-50">
        <Avatar slug="laura-torres" name="Laura Torres" className="size-10" />
        <div className="hidden min-w-0 flex-1 lg:block">
          <p className="truncate text-sm font-semibold">Laura Torres</p>
          <p className="truncate text-xs text-muted">Propietaria</p>
        </div>
        <ChevronsUpDown className="hidden size-4 text-muted lg:block" aria-hidden />
      </Link>
    </aside>
  );
}
