import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

export const fieldClass =
  "h-12 w-full rounded-field border border-field bg-white px-4 text-[15px] text-ink placeholder:text-muted/80 transition-shadow focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 aria-[invalid=true]:border-danger-fg aria-[invalid=true]:ring-danger/15 disabled:bg-canvas disabled:text-muted";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldClass, "h-auto min-h-28 py-3", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  // biome-ignore lint: el htmlFor lo aporta quien la usa
  return <label className={cn("mb-1.5 block text-sm font-semibold", className)} {...props} />;
}

/** Campo con etiqueta, ayuda y error asociados (aria-describedby / aria-invalid). */
export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  className?: string;
  children: (a: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(error ? { "aria-invalid": true } : {}),
      })}
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-sm font-medium text-danger-fg">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
