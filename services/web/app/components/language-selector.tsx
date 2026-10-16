import { type Lang, pathFor, translatePath } from "@mcet/i18n";
import { Check, ChevronDown } from "lucide-react";
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
    // Si se cambia a inglés y hay URL específica configurada para inglés, usar la URL en inglés
    if (targetLang === "en" && site.siteUrls?.en) {
      return `${site.siteUrls.en}${targetPath}`;
    }
    // Si estamos en inglés y cambiamos a español u otro idioma
    if (targetLang === "es" && site.siteUrls?.es && site.lang === "en") {
      return `${site.siteUrls.es}${targetPath}`;
    }
    // Si el idioma destino tiene una URL específica configurada y difiere de la actual
    if (site.siteUrls?.[targetLang] && site.siteUrls[targetLang] !== site.siteUrl) {
      return `${site.siteUrls[targetLang]}${targetPath}`;
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
        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[var(--radius-field)] border border-border/80 bg-surface px-2.5 py-1.5 text-sm font-medium text-text hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <span className="text-lg leading-none" role="img" aria-label={currentLang.country}>
          {currentLang.flag}
        </span>
        <span className="text-[14px] uppercase tracking-wider">{currentLang.code}</span>
        <ChevronDown
          aria-hidden="true"
          className={cx("size-3.5 text-muted transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 z-50 mt-1.5 w-48 origin-top-right rounded-lg border border-border bg-surface p-1 shadow-lg ring-1 ring-black/5 focus:outline-none"
        >
          <div className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
            {t.common.language?.switchToLabel ?? "Seleccionar idioma"}
          </div>
          <div className="divide-y divide-border/40">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const isSelected = lang.code === site.lang;
              const targetUrl = getTargetUrl(lang.code);
              return (
                <a
                  key={lang.code}
                  href={targetUrl}
                  hrefLang={lang.code}
                  role="menuitem"
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelect(lang.code, targetUrl);
                  }}
                  className={cx(
                    "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-surface-2",
                    isSelected ? "font-semibold text-primary bg-primary/5" : "text-text",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg leading-none" role="img" aria-label={lang.country}>
                      {lang.flag}
                    </span>
                    <span className="text-[14px]">{lang.nativeName}</span>
                  </div>
                  {isSelected && <Check className="size-4 text-primary" aria-hidden="true" />}
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
