import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const badge = cva("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", {
  variants: {
    tone: {
      primary: "bg-primary-50 text-primary",
      success: "bg-success-soft text-success-fg",
      warning: "bg-warning-soft text-warning-fg",
      danger: "bg-danger-soft text-danger-fg",
      neutral: "bg-cat-gray text-muted",
    },
  },
  defaultVariants: { tone: "primary" },
});

export function Badge({ className, tone, ...props }: ComponentProps<"span"> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}
