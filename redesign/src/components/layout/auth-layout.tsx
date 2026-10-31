import { CalendarCheck2, ShieldCheck, Sparkles } from "lucide-react";
import { Outlet, ScrollRestoration } from "react-router";
import { Logo } from "@/components/ui/logo";
import { assets } from "@/lib/assets";

const points = [
  [CalendarCheck2, "Reservas en línea 24/7"],
  [Sparkles, "Recordatorios automáticos"],
  [ShieldCheck, "30 días de prueba, sin tarjeta"],
] as const;

/** Autenticación: formulario centrado y panel de marca en pantallas anchas. */
export function AuthLayout() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <Logo />
        <main id="contenido" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <Outlet />
        </main>
        <p className="text-center text-xs text-muted">© 2026 Mi Cita en Tiempo</p>
      </div>
      <aside
        aria-hidden
        className="bg-cta-glow relative hidden overflow-hidden text-white lg:flex lg:items-center lg:justify-center"
      >
        <img src={assets.sparkle} alt="" className="absolute right-16 top-16 size-16 opacity-60" />
        <div className="relative max-w-md px-10">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">
            Tus clientes reservan. Tú ganas tiempo.
          </h2>
          <p className="mt-4 text-lg text-white/80">
            Una plataforma simple y poderosa para gestionar tus citas, recordatorios y pagos.
          </p>
          <ul className="mt-8 space-y-4">
            {points.map(([Icon, t]) => (
              <li key={t} className="flex items-center gap-3 font-medium">
                <span className="grid size-10 place-items-center rounded-xl bg-white/15">
                  <Icon className="size-5" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <ScrollRestoration />
    </div>
  );
}
