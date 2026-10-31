import { Tooltip as T } from "radix-ui";
import type { ReactNode } from "react";

export const TooltipProvider = T.Provider;

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          sideOffset={6}
          className="z-50 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-white shadow-pop data-[state=delayed-open]:animate-pop"
        >
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
