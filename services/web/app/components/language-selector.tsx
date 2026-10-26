import { type Lang, pathFor, translatePath } from "@mcet/i18n";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { cx, useRoot } from "~/lib/i18n";

export interface LanguageOption {
  code: Lang;
  name: string;
  nativeName: string;
  flag: string;
  country: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "es", name: "Español", nativeName: "Español", flag: "🇪🇸", country: "España" },
  { code: "en", name: "Inglés", nativeName: "English", flag: "🇺🇸", country: "USA" },
  { code: "fr", name: "Francés", nativeName: "Français", flag: "🇫🇷", country: "France" },
  { code: "pt", name: "Portugués", nativeName: "Português", flag: "🇧🇷", country: "Brasil" },
  { code: "de", name: "Alemán", nativeName: "Deutsch", flag: "🇩🇪", country: "Deutschland" },
  { code: "it", name: "Italiano", nativeName: "Italiano", flag: "🇮🇹", country: "Italia" },
];

export function LanguageSelector({ className }: { className?: string }) {
  const { site, t } = useRoot();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLang: LanguageOption =
    SUPPORTED_LANGUAGES.find((l) => l.code === site.lang) ?? (SUPPORTED_LANGUAGES[0] as LanguageOption);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [open]);

  function getTargetUrl(targetLang: Lang): string {
    const targetPath = translatePath(pathname, targetLang) ?? pathFor("home", targetLang);
    const esBase = site.siteUrls?.es;
    const enBase = site.siteUrls?.en;

    if (targetLang === "es") {
      if (esBase && site.lang !== "es") {
        return `${esBase}${targetPath}`;
      }
      return targetPath;
    }

    // Para inglés y para cualquier otro idioma (fr, pt, de, it), el host es el de inglés
    if (enBase && site.lang === "es") {
      return `${enBase}${targetPath}`;
    }
    return targetPath;
  }

  function handleSelect(targetLang: Lang, targetUrl: string) {
    // Guardar cookie de idioma para recordar preferencia
    // biome-ignore lint/suspicious/noDocumentCookie: asignación directa de cookie necesaria en cliente
    document.cookie = `mcet_lang=${targetLang}; path=/; max-age=31536000; SameSite=Lax`;
    setOpen(false);

    // Si la URL es absoluta (cambio de dominio, ej. dominio en inglés)
    if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
      window.location.assign(targetUrl);
    } else {
      window.location.assign(targetUrl);
    }
  }

  return (
    <div ref={containerRef} className={cx("relative inline-block text-left", className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`${t.common.language?.switchToLabel ?? "Cambiar idioma"}: ${currentLang.nativeName}`}
        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-xs font-semibold text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="uppercase tracking-wide">{currentLang.code}</span>
        <ChevronDown
          aria-hidden="true"
          className={cx(
            "size-3 fill-current text-text motion-safe:transition-transform motion-safe:duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 z-50 mt-1.5 max-h-[45dvh] lg:max-h-[min(32rem,70dvh)] w-max max-w-[calc(100vw-2rem)] origin-top-right overflow-y-auto rounded-lg border border-border bg-surface shadow-lg focus:outline-none"
        >
          <div className="divide-y divide-border">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const isSelected = lang.code === site.lang;
              const targetUrl = getTargetUrl(lang.code);
              return (
                <a
                  key={lang.code}
                  href={targetUrl}
                  hrefLang={lang.code}
                  role="menuitem"
                  aria-current={isSelected ? "true" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelect(lang.code, targetUrl);
                  }}
                  className={cx(
                    "flex min-h-11 w-full items-center px-3 py-2 text-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                    isSelected ? "font-semibold text-primary bg-surface-2" : "text-text",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="inline-flex h-6 w-8 shrink-0 items-center justify-center rounded border border-border bg-surface text-lg leading-none"
                      aria-hidden="true"
                    >
                      {lang.flag}
                    </span>
                    <span className="whitespace-nowrap">{lang.nativeName}</span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export { LanguageSelector as LanguageLink };
