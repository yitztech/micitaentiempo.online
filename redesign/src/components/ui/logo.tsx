import { Link } from "react-router";
import { assets } from "@/lib/assets";
import { cn } from "@/lib/utils";

/** Logotipo horizontal aprobado (calendario índigo + confirmación verde). */
export function Logo({ dark, className, to = "/" }: { dark?: boolean; className?: string; to?: string }) {
  return (
    <Link
      to={to}
      aria-label="Mi Cita en Tiempo, inicio"
      className={cn("inline-flex items-center", className)}
    >
      <img
        src={dark ? assets.logoDark : assets.logo}
        alt="Mi Cita en Tiempo"
        width={252}
        height={64}
        className="h-10 w-auto sm:h-11"
      />
    </Link>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src={assets.isotipo}
      alt=""
      aria-hidden
      width={64}
      height={64}
      className={cn("size-10", className)}
    />
  );
}
