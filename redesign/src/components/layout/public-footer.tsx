import { Link } from "react-router";
import { Logo } from "@/components/ui/logo";

const cols = [
  {
    title: "Producto",
    links: [
      ["Funciones", "/funciones"],
      ["Precios", "/precios"],
      ["Directorio", "/directorio"],
    ],
  },
  {
    title: "Cuenta",
    links: [
      ["Ingresar", "/ingresar"],
      ["Crear cuenta", "/registro"],
      ["Recuperar contraseña", "/recuperar"],
    ],
  },
  {
    title: "Ayuda",
    links: [
      ["Preguntas frecuentes", "/#preguntas"],
      ["Contacto", "/#contacto"],
    ],
  },
] as const;

export function PublicFooter() {
  return (
    <footer className="mt-24 bg-ink text-white">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo dark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">
            Reservas en línea, recordatorios y pagos para cualquier negocio. Tus clientes reservan, tú ganas
            tiempo.
          </p>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="text-sm font-bold text-white">{c.title}</h2>
            <ul className="mt-3 space-y-1">
              {c.links.map(([l, to]) => (
                <li key={l}>
                  <Link
                    to={to}
                    className="inline-flex min-h-9 items-center text-sm text-white/70 hover:text-white"
                  >
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-white/60 sm:flex-row sm:justify-between">
          <p>© 2026 Mi Cita en Tiempo. Todos los derechos reservados.</p>
          <p>micitaentiempo.online</p>
        </div>
      </div>
    </footer>
  );
}
