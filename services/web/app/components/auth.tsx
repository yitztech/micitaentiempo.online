import type { ReactNode } from "react";
import { postJson } from "~/lib/api-client";
import { useRoot } from "~/lib/i18n";
import { Button, Card, OrDivider } from "./ui";

/** Tarjeta de las páginas de acceso: título, entradilla y una acción principal. */
export function AuthCard({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {lead ? <p className="mt-2 text-muted">{lead}</p> : null}
        <div className="mt-6">{children}</div>
      </Card>
      {footer ? <p className="mt-6 text-center text-[15px] text-muted">{footer}</p> : null}
    </>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h6a5.1 5.1 0 0 1-2.2 3.4v2.8h3.6c2.1-1.9 3.2-4.8 3.2-8.2z"
      />
      <path
        fill="#34A853"
        d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.9A11 11 0 0 0 12 23z"
      />
      <path fill="#FBBC05" d="M5.7 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.1H2a11 11 0 0 0 0 9.8L5.7 14z" />
      <path
        fill="#EA4335"
        d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2 7.1L5.7 10C6.6 7.4 9.1 5.4 12 5.4z"
      />
    </svg>
  );
}

/** «Continuar con Google» (solo si Google está configurado) seguido del separador «o». */
export function GoogleButton({ callbackURL, divider = true }: { callbackURL: string; divider?: boolean }) {
  const { t, features } = useRoot();
  if (!features.google) return null;
  async function go() {
    const res = await postJson<{ url?: string }>("/api/auth/sign-in/social", {
      provider: "google",
      callbackURL,
    });
    if (res.url) window.location.assign(res.url);
  }
  return (
    <>
      <Button variant="secondary" size="lg" className="w-full" onClick={() => void go()}>
        <GoogleIcon />
        {t.auth.google}
      </Button>
      {divider ? <OrDivider /> : null}
    </>
  );
}
