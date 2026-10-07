import { pathFor } from "@mcet/i18n";
import { Link } from "react-router";
import { useRoot } from "~/lib/i18n";

/** Marca: calendario con un punto Albaricoque (formas geométricas, sin personas ni símbolos). */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <rect
        x="7"
        y="9"
        width="18"
        height="16"
        rx="3"
        fill="none"
        stroke="var(--on-primary)"
        strokeWidth="2"
      />
      <path d="M7 14h18M12 6.5v4M20 6.5v4" stroke="var(--on-primary)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="20.5" cy="20.5" r="3" fill="#e8a37a" />
    </svg>
  );
}

export function Logo() {
  const { site, t } = useRoot();
  return (
    <Link to={pathFor("home", site.lang)} className="flex items-center gap-2.5 font-semibold tracking-tight">
      <LogoMark />
      <span className="text-[17px]">{t.common.site.name}</span>
    </Link>
  );
}
