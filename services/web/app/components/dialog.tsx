import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { useT } from "~/lib/i18n";

/** Diálogo modal nativo (foco atrapado y Esc por el navegador); a pantalla completa en móvil. */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useT();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="dialogo-titulo"
      className="m-0 h-dvh max-h-dvh w-full max-w-none bg-surface p-0 text-text backdrop:bg-[#0f1a1f]/55 sm:m-auto sm:h-auto sm:max-h-[90dvh] sm:max-w-xl sm:rounded-[var(--radius-card)] sm:shadow-[var(--shadow-soft)]"
    >
      {open ? (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 id="dialogo-titulo" className="text-lg font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.common.ui.close}
              className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto px-5 py-5">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}
