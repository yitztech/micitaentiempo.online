import { Outlet } from "react-router";
import { LanguageLink } from "~/components/language-link";
import { Logo } from "~/components/logo";
import { Container } from "~/components/ui";

/** Páginas de acceso: marca, idioma y una tarjeta centrada (una acción por pantalla). */
export default function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header>
        <Container className="flex min-h-16 items-center justify-between gap-3 py-2">
          <Logo />
          <LanguageLink />
        </Container>
      </header>
      <main
        id="contenido"
        className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0"
      >
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
