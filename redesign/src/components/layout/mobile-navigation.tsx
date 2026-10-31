import { Ellipsis } from "lucide-react";
import { Link, NavLink } from "react-router";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { panelItems } from "./dashboard-nav";

const main = panelItems.filter((i) =>
  ["/panel", "/panel/calendario", "/panel/clientes", "/panel/avisos"].includes(i.to),
);
const more = panelItems.filter((i) => !main.includes(i));

const tab =
  "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold";

/** Barra inferior del panel en móvil: cuatro destinos principales + «Más». */
export function MobileNavigation() {
  return (
    <nav
      aria-label="Navegación del panel"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line/70 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      {main.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end ?? false}
          className={({ isActive }) => cn(tab, isActive ? "text-primary" : "text-muted")}
        >
          <it.icon className="size-6" aria-hidden />
          {it.label}
          {it.badge ? (
            <span className="absolute left-1/2 top-1.5 ml-2 grid size-4 place-items-center rounded-full bg-danger text-[10px] font-bold text-white">
              {it.badge}
            </span>
          ) : null}
        </NavLink>
      ))}
      <Dialog>
        <DialogTrigger className={cn(tab, "text-muted")}>
          <Ellipsis className="size-6" aria-hidden />
          Más
        </DialogTrigger>
        <DialogContent title="Más secciones" side="right">
          <ul className="space-y-1">
            {more.map((it) => (
              <li key={it.to}>
                <DialogClose asChild>
                  <Link
                    to={it.to}
                    className="flex min-h-12 items-center gap-3 rounded-xl px-3 font-semibold hover:bg-primary-50"
                  >
                    <it.icon className="size-5 text-primary" aria-hidden /> {it.label}
                  </Link>
                </DialogClose>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </nav>
  );
}
