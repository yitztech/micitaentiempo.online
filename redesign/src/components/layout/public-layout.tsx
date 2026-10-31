import { Outlet, ScrollRestoration } from "react-router";
import { PublicFooter } from "./public-footer";
import { PublicHeader } from "./public-header";

export function PublicLayout() {
  return (
    <>
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>
      <PublicHeader />
      <main id="contenido">
        <Outlet />
      </main>
      <PublicFooter />
      <ScrollRestoration />
    </>
  );
}
