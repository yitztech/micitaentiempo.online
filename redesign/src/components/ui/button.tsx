import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-field font-semibold transition-[background,box-shadow,transform,color,border-color] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white shadow-[0_6px_16px_-6px_rgb(67_56_202/0.7)] hover:bg-primary-hover",
        outline: "border border-primary/60 bg-white text-primary hover:bg-primary-50",
        soft: "bg-primary-50 text-primary hover:bg-primary-100",
        ghost: "text-ink hover:bg-primary-50",
        light: "bg-white text-primary hover:bg-primary-50",
        danger: "bg-danger-fg text-white hover:bg-danger",
      },
      size: {
        sm: "h-10 px-4 text-sm",
        md: "h-11 px-5 text-[15px]",
        lg: "h-12 px-6 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Props = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, type = "button", ...props }: Props) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      {...(asChild ? {} : { type })}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
