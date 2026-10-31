import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  title,
  description,
  children,
  side = "center",
  ...props
}: Omit<ComponentProps<typeof D.Content>, "title"> & {
  title: string;
  description?: string;
  side?: "center" | "right";
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] data-[state=open]:animate-pop" />
      <D.Content
        className={cn(
          "fixed z-50 bg-surface p-6 shadow-pop focus:outline-none data-[state=open]:animate-pop",
          side === "center"
            ? "left-1/2 top-1/2 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-panel"
            : "inset-y-0 right-0 w-[min(22rem,92vw)] overflow-y-auto rounded-l-panel",
          className,
        )}
        {...props}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <D.Title className="text-lg font-bold tracking-tight">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-sm text-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close
            aria-label="Cerrar"
            className="grid size-11 shrink-0 -translate-y-1 translate-x-2 place-items-center rounded-full text-muted hover:bg-primary-50 hover:text-ink"
          >
            <X className="size-5" />
          </D.Close>
        </div>
        {children as ReactNode}
      </D.Content>
    </D.Portal>
  );
}
