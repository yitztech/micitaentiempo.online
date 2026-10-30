import { Tabs as T } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof T.List>) {
  return <T.List className={cn("inline-flex rounded-field bg-primary-50 p-1", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "inline-flex h-9 min-w-11 items-center justify-center rounded-[9px] px-3.5 text-sm font-semibold text-muted transition-colors hover:text-ink data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-card",
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = T.Content;
