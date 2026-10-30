import { Globe, Menu } from "lucide-react";
import { Link, NavLink } from "react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Logo } from "@/components/ui/logo";
import { nav } from "@/lib/data";
import { cn } from "@/lib/utils";

const link = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:text-primary",
    isActive ? "text-primary" : "text-ink/80",
  );

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/50 bg-canvas/85 backdrop-blur-md">
      <div className="container-page flex h-[72px] items-center gap-4 lg:gap-8">
        <Logo />
        <nav aria-label="Principal" className="ml-2 hidden items-center gap-1 lg:flex">
          {nav.map((n) => (
            <NavLink key={n.label} to={n.to} className={link}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          <a
            href="https://myappointmentontime.online"
            hrefLang="en"
            lang="en"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-ink/80 hover:text-primary"
          >
            <Globe className="size-4" aria-hidden /> EN<span className="sr-only"> English</span>
          </a>
          <Button asChild variant="outline" size="sm">
            <Link to="/ingresar">Ingresar</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/registro">Empieza gratis</Link>
          </Button>
        </div>
        <div className="ml-auto md:hidden">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Abrir menú">
                <Menu className="size-6" />
              </Button>
            </DialogTrigger>
            <DialogContent title="Menú" side="right">
              <nav aria-label="Menú móvil" className="flex flex-col gap-1">
                {nav.map((n) => (
                  <DialogClose asChild key={n.label}>
                    <Link
                      to={n.to}
                      className="flex min-h-12 items-center rounded-xl px-3 text-base font-semibold hover:bg-primary-50"
                    >
                      {n.label}
                    </Link>
                  </DialogClose>
                ))}
              </nav>
              <div className="mt-6 grid gap-3">
                <DialogClose asChild>
                  <Button asChild variant="outline">
                    <Link to="/ingresar">Ingresar</Link>
                  </Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button asChild>
                    <Link to="/registro">Empieza gratis</Link>
                  </Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}
