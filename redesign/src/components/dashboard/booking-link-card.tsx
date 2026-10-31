import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export function BookingLinkCard({ url = "micitaentiempo.online/tu-negocio" }: { url?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`https://${url}`);
    } catch {
      /* el portapapeles puede no estar disponible; el estado visual se mantiene */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Enlace de reserva</CardTitle>
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
        >
          {copied ? "¡Copiado!" : "Copiar enlace"}
        </button>
      </CardHeader>
      <CardBody>
        <div className="flex items-center gap-2 rounded-field border border-field bg-canvas px-3.5 py-2.5">
          <span className="min-w-0 flex-1 truncate text-sm text-muted">https://{url}</span>
          <button
            type="button"
            onClick={copy}
            aria-label="Copiar enlace"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-primary-50 hover:text-primary"
          >
            {copied ? <Check className="size-4 text-success-fg" /> : <Copy className="size-4" />}
          </button>
        </div>
        <p aria-live="polite" className="sr-only">
          {copied ? "Enlace copiado" : ""}
        </p>
      </CardBody>
    </Card>
  );
}
