import { type Lang, pathFor } from "@mcet/i18n";
import { Check, Copy } from "lucide-react";
import { useId, useState } from "react";
import { useT } from "~/lib/i18n";
import { Button } from "./ui";

/** Texto de solo lectura con botón «Copiar» (enlace de reserva, código de embed). */
export function CopyField({
  label,
  value,
  multiline,
  event,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  event?: string;
}) {
  const p = useT().panel.home;
  const id = useId();
  const [copied, setCopied] = useState(false);
  const cls =
    "block w-full rounded-[var(--radius-field)] border border-border bg-surface-2 px-3 py-2.5 font-mono text-sm";
  return (
    <div>
      <label htmlFor={id} className="block text-[15px] font-medium">
        {label}
      </label>
      <div className="mt-1.5 flex gap-2">
        {multiline ? (
          <textarea id={id} readOnly value={value} rows={3} className={cls} />
        ) : (
          <input id={id} readOnly value={value} className={`${cls} min-h-11`} />
        )}
        <Button
          variant="secondary"
          data-umami-event={event}
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2_000);
          }}
        >
          {copied ? (
            <Check aria-hidden className="size-4 text-success" />
          ) : (
            <Copy aria-hidden className="size-4" />
          )}
          <span aria-live="polite">{copied ? p.copied : p.copy}</span>
        </Button>
      </div>
    </div>
  );
}

/** Fragmentos de embed para un tablero (iframe y botón con embed.js) en el dominio del idioma. */
export function embedSnippets(siteUrl: string, lang: Lang, slug: string, title: string) {
  return {
    link: `${siteUrl}${pathFor("booking", lang, { slug })}`,
    iframe: `<iframe src="${siteUrl}/embed/${slug}" title="${title}" loading="lazy" style="width:100%;min-height:680px;border:0"></iframe>`,
    script: `<script src="${siteUrl}/embed.js" data-calendar="${slug}" data-mode="button" async></script>`,
  };
}
