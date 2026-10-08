import { type ComponentProps, useId } from "react";

/** Selector nativo con etiqueta (accesible y ligero en móvil). */
export function Select({
  label,
  hint,
  children,
  className,
  ...props
}: Omit<ComponentProps<"select">, "id"> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[15px] font-medium">
        {label}
      </label>
      <select
        {...props}
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-1.5 block min-h-11 w-full rounded-[var(--radius-field)] border border-border-field bg-surface px-3 text-base text-text"
      >
        {children}
      </select>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
