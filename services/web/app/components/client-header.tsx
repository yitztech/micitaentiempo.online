import { pathFor } from "@mcet/i18n";
import { NavLink } from "react-router";
import { useRoot } from "~/lib/i18n";
import { LanguageLink } from "./language-link";
import { Logo } from "./logo";
import { buttonClass, Container } from "./ui";

/**
 * Cabecera mínima para el cliente final (reserva y Mis citas).
 * PROPUESTA.md § Arquitectura de navegación: enlace de salto, Mis citas e idioma, sin la
 * navegación comercial. `showMyAppointments` se apaga en la propia página de Mis citas.
 */
export function ClientHeader({ showMyAppointments = true }: { showMyAppointments?: boolean }) {
  const { site, t } = useRoot();
  const n = t.common.nav;
  return (
    <header className="border-b border-border">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        {n.skipToContent}
      </a>
      <Container className="flex h-16 items-center justify-between gap-2">
        <Logo />
        <div className="flex items-center gap-1">
          {showMyAppointments ? (
            <NavLink to={pathFor("myAppointments", site.lang)} className={buttonClass("ghost")}>
              {n.myAppointments}
            </NavLink>
          ) : null}
          <LanguageLink />
        </div>
      </Container>
    </header>
  );
}
