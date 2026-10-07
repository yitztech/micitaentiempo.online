import { CheckCircle2, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import type { AltchaState } from "~/lib/altcha";
import { useT } from "~/lib/i18n";

/** Estado visible de la comprobación antibots (aria-live para lectores de pantalla). */
export function AltchaStatus({ state, onRetry }: { state: AltchaState; onRetry: () => void }) {
  const a = useT().auth.altcha;
  return (
    <div
      aria-live="polite"
      className="flex min-h-11 items-center gap-2 rounded-[var(--radius-field)] border border-border bg-surface-2 px-3 text-sm"
    >
      {state === "verifying" ? (
        <>
          <Loader2 aria-hidden className="size-4 animate-spin text-primary" />
          {a.verifying}
        </>
      ) : state === "verified" ? (
        <>
          <CheckCircle2 aria-hidden className="size-4 text-success" />
          {a.verified}
        </>
      ) : state === "error" ? (
        <>
          <TriangleAlert aria-hidden className="size-4 text-danger" />
          {a.error}
          <button
            type="button"
            onClick={onRetry}
            className="ml-auto font-medium text-primary underline underline-offset-2"
          >
            {a.label}
          </button>
        </>
      ) : (
        <>
          <ShieldCheck aria-hidden className="size-4 text-muted" />
          {a.label}
        </>
      )}
      <span className="ml-auto text-xs text-muted">{a.footer}</span>
    </div>
  );
}
