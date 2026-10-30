import { Outlet, ScrollRestoration } from "react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardHeader } from "./dashboard-header";
import { DashboardSidebar } from "./dashboard-sidebar";
import { MobileNavigation } from "./mobile-navigation";

export function DashboardLayout() {
  return (
    <TooltipProvider>
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>
      <div className="flex min-h-dvh">
        <DashboardSidebar />
        <div className="min-w-0 flex-1">
          <DashboardHeader />
          <main
            id="contenido"
            className="mx-auto w-full max-w-[1500px] px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-6"
          >
            <Outlet />
          </main>
        </div>
      </div>
      <MobileNavigation />
      <ScrollRestoration />
    </TooltipProvider>
  );
}
