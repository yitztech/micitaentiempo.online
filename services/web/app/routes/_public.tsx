import { Outlet } from "react-router";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";

export default function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="contenido" className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
