import { pathFor, translatePath } from "@mcet/i18n";
import { Languages } from "lucide-react";
import { useLocation } from "react-router";
import { cx, useRoot } from "~/lib/i18n";

/**
 * Enlace al mismo contenido en el otro idioma (otro dominio). Sin banderas y sin redirección
 * automática; avisa de que la sesión es por dominio.
 */
export function LanguageLink({ className }: { className?: string }) {
  const { site, t } = useRoot();
  const { pathname } = useLocation();
  const path = translatePath(pathname, site.other) ?? pathFor("home", site.other);
  return (
    <a
      href={`${site.otherSiteUrl}${path}`}
      hrefLang={site.other}
      lang={site.other}
      title={t.common.language.sessionNote}
      aria-label={t.common.language.switchToLabel}
      className={cx(
        "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[var(--radius-field)] px-2 text-[15px] hover:bg-surface-2",
        className,
      )}
    >
      <Languages aria-hidden className="size-4" />
      {t.common.language.switchTo}
    </a>
  );
}
