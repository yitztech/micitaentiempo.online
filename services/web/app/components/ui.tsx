import { AlertCircle, CheckCircle2, Eye, EyeOff, Info, Loader2, TriangleAlert } from "lucide-react";
import { type ComponentProps, type ReactNode, useId, useState } from "react";
import { Link, type LinkProps } from "react-router";
import { cx, useT } from "~/lib/i18n";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-field)] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 select-none";
const sizes: Record<Size, string> = { md: "min-h-11 px-4 text-[15px]", lg: "min-h-12 px-6 text-base" };
const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover shadow-[var(--shadow-soft)]",
  secondary: "border border-border bg-surface text-text hover:bg-surface-2",
  ghost: "text-text hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(base, sizes[size], variants[variant], extra);
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      aria-busy={loading || undefined}
      disabled={props.disabled || loading}
      className={buttonClass(variant, size, className)}
    >
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link {...props} className={buttonClass(variant, size, className)} />;
}

export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cx("mx-auto w-full max-w-6xl px-4 sm:px-6", className)} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cx(
        "rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-soft)]",
        className,
      )}
    />
  );
}

export function Badge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      {...props}
      className={cx(
        "inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary",
        className,
      )}
    />
  );
}

const alertStyles = {
  info: { cls: "bg-primary-soft text-text border-primary/30", Icon: Info },
  success: { cls: "bg-success-soft text-text border-success/40", Icon: CheckCircle2 },
  warning: { cls: "bg-warning-soft text-text border-warning/40", Icon: TriangleAlert },
  danger: { cls: "bg-danger-soft text-text border-danger/40", Icon: AlertCircle },
};

/** Aviso con icono (el color nunca es la única señal). */
export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: keyof typeof alertStyles;
  children: ReactNode;
  className?: string;
}) {
  const { cls, Icon } = alertStyles[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cx("flex gap-3 rounded-[var(--radius-field)] border p-3 text-[15px]", cls, className)}
    >
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

interface FieldProps extends Omit<ComponentProps<"input">, "id"> {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
}

const inputClass =
  "block min-h-11 w-full rounded-[var(--radius-field)] border border-border bg-surface px-3 text-base text-text placeholder:text-muted/70 focus:border-primary focus:outline-none focus-visible:outline-3 focus-visible:outline-primary aria-[invalid=true]:border-danger";

/** Campo con etiqueta, ayuda y error asociados (aria-describedby). */
export function Field({ label, hint, error, optional, className, type, ...props }: FieldProps) {
  const id = useId();
  const t = useT();
  const [visible, setVisible] = useState(false);
  const describedBy =
    [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  const isPassword = type === "password";
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[15px] font-medium">
        {label}
        {optional ? <span className="ml-1 font-normal text-muted">({t.common.ui.optional})</span> : null}
      </label>
      <div className="relative mt-1.5">
        <input
          {...props}
          id={id}
          type={isPassword && visible ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(inputClass, isPassword && "pr-12")}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? t.common.ui.hidePassword : t.common.ui.showPassword}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[var(--radius-field)] text-muted hover:text-text"
          >
            {visible ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
          </button>
        ) : null}
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-center gap-1.5 text-sm text-danger">
          <AlertCircle aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextArea({
  label,
  hint,
  error,
  className,
  ...props
}: Omit<ComponentProps<"textarea">, "id"> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[15px] font-medium">
        {label}
      </label>
      <textarea
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cx(inputClass, "mt-1.5 min-h-32 py-2.5")}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label: ReactNode }) {
  const id = useId();
  return (
    <div className={cx("flex items-start gap-3", className)}>
      <input {...props} id={id} type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" />
      <label htmlFor={id} className="text-[15px]">
        {label}
      </label>
    </div>
  );
}

/** Separador «o» entre Google y el formulario. */
export function OrDivider() {
  const t = useT();
  return (
    <div className="my-6 flex items-center gap-3 text-sm text-muted" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      {t.common.ui.or}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
