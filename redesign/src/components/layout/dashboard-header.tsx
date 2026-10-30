import { Bell, Search } from "lucide-react";
import { Link } from "react-router";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line/50 bg-canvas/90 px-4 backdrop-blur-md md:justify-end md:px-8">
      <div className="md:hidden">
        <Logo to="/panel" />
      </div>
      <div className="ml-auto flex items-center gap-1 md:ml-0">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Buscar">
              <Search className="size-5" />
            </Button>
          </DialogTrigger>
          <DialogContent title="Buscar" description="Clientes, citas y avisos.">
            <search>
              <form onSubmit={(e) => e.preventDefault()}>
                <Input
                  type="search"
                  name="q"
                  aria-label="Buscar en el panel"
                  placeholder="Buscar clientes o citas…"
                  autoFocus
                />
              </form>
            </search>
          </DialogContent>
        </Dialog>
        <Button asChild variant="ghost" size="icon" className="relative">
          <Link to="/panel/avisos" aria-label="Avisos, 2 sin leer">
            <Bell className="size-5" />
            <span
              aria-hidden
              className="absolute right-2 top-2 size-2.5 rounded-full bg-danger ring-2 ring-canvas"
            />
          </Link>
        </Button>
        <Link
          to="/panel/cuenta"
          aria-label="Mi cuenta"
          className="ml-1 grid size-11 place-items-center rounded-full md:hidden"
        >
          <Avatar slug="laura-torres" name="Laura Torres" className="size-9" />
        </Link>
      </div>
    </header>
  );
}
