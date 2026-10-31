import { pathFor } from "@mcet/i18n";
import { useId } from "react";
import { Link } from "react-router";
import { useRoot } from "~/lib/i18n";

/** Marca del rediseño: calendario en gradiente índigo-violeta con insignia de confirmación esmeralda. */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  const gradId = useId();
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563EB" />
          <stop offset="0.55" stopColor="#4338CA" />
          <stop offset="1" stopColor="#6D28D9" />
        </linearGradient>
      </defs>
      <rect x="14" y="3" width="6" height="14" rx="3" fill="#fff" stroke="#4338CA" strokeWidth="2" />
      <rect x="38" y="3" width="6" height="14" rx="3" fill="#fff" stroke="#4338CA" strokeWidth="2" />
      <rect x="4" y="9" width="52" height="49" rx="13" fill={`url(#${gradId})`} />
      <rect x="11" y="21" width="38" height="30" rx="6" fill="#fff" fillOpacity="0.92" />
      <circle cx="19" cy="29" r="2.8" fill="#C4B5FD" />
      <circle cx="29" cy="29" r="2.8" fill="#3B82F6" />
      <circle cx="39" cy="29" r="2.8" fill="#C4B5FD" />
      <circle cx="19" cy="39" r="2.8" fill="#C4B5FD" />
      <circle cx="29" cy="39" r="2.8" fill="#C4B5FD" />
      <circle cx="47" cy="47" r="14" fill="#10B981" stroke="#fff" strokeWidth="3.5" />
      <path
        d="M40.5 47.5l4.8 4.8 8.7-9.8"
        fill="none"
        stroke="#fff"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo() {
  const { site, t } = useRoot();
  return (
    <Link
      to={pathFor("home", site.lang)}
      className="flex min-w-0 items-center gap-2.5 font-extrabold tracking-tight text-text"
    >
      <LogoMark className="size-9 shrink-0" />
      <span className="min-w-0 text-[18px] leading-tight">{t.common.site.name}</span>
    </Link>
  );
}
