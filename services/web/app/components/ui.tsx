import { MULTI_LINE, SINGLE_LINE } from "@mcet/schemas/text-policy";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Info, Loader2, TriangleAlert } from "lucide-react";
import { type ComponentProps, type ReactNode, useId, useState, useSyncExternalStore } from "react";
import { Link, type LinkProps } from "react-router";
import { cx, useT } from "~/lib/i18n";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-field)] font-semibold transition-[background,box-shadow,transform,color,border-color] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 select-none";
const sizes: Record<Size, string> = { md: "min-h-11 px-4 text-[15px]", lg: "min-h-12 px-6 text-base" };
const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary shadow-[0_6px_16px_-6px_rgb(67_56_202/0.55)] hover:bg-primary-hover",
  secondary: "border border-primary/40 bg-surface text-primary hover:bg-primary-soft",
  ghost: "text-text hover:bg-surface-2",
  danger: "bg-[#b91c1c] text-white hover:bg-[#991b1b]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(base, sizes[size], variants[variant], extra);
}

const noop = () => () => undefined;
/** true en el navegador tras hidratar; false en el HTML del servidor. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  // Los formularios los envía JavaScript: antes de hidratar, enviar haría un POST nativo sin acción.
  const hydrated = useHydrated();
  return (
    <button
      type="button"
      {...props}
      aria-busy={loading || undefined}
      disabled={props.disabled || loading || (props.type === "submit" && !hydrated)}
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

/**
 * Anchos de contenedor (docs/design/cliente-2026-10-07/PROPUESTA.md § Sistema visual).
 * `cx` solo concatena: no pases `max-w-*` en className, elige aquí la variante.
 * - page: páginas públicas y reserva (1152 px).
 * - prose: lectura larga, FAQ, legales y Mis citas (~70ch).
 * - form: formularios de una columna como Contacto (640 px de contenido).
 * - auth: tarjetas de acceso (448 px).
 */
const containerWidths = {
  page: "max-w-6xl",
  booking: "max-w-4xl",
  prose: "max-w-3xl",
  form: "max-w-[calc(40rem+2rem)] sm:max-w-[calc(40rem+3rem)]",
  auth: "max-w-md",
} as const;

export function Container({
  className,
  width = "page",
  ...props
}: ComponentProps<"div"> & { width?: keyof typeof containerWidths }) {
  return <div {...props} className={cx("mx-auto w-full px-4 sm:px-6", containerWidths[width], className)} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cx(
        "rounded-[var(--radius-card)] border border-border/80 bg-surface shadow-[var(--shadow-soft)]",
        className,
      )}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cx("flex flex-col space-y-1.5 p-6 pb-4", className)} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      {...props}
      className={cx("font-display text-xl font-semibold leading-tight tracking-tight text-text", className)}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p {...props} className={cx("text-sm text-muted", className)} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cx("p-6 pt-0", className)} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cx("flex items-center p-6 pt-0", className)} />;
}

export function Badge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      {...props}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3.5 py-1 text-xs font-semibold text-primary ring-1 ring-primary/15",
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
  errorPosition?: "top" | "bottom";
  optional?: boolean;
}

const inputClass =
  "block min-h-11 w-full rounded-[var(--radius-field)] border border-border-field bg-surface px-3 text-base text-text placeholder:text-muted/70 focus:border-primary focus:outline-none focus-visible:outline-3 focus-visible:outline-primary aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-soft/20 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-danger aria-[invalid=true]:focus:border-danger aria-[invalid=true]:focus:ring-2 aria-[invalid=true]:focus:ring-danger aria-[invalid=true]:focus-visible:outline-danger";

/** Campo con etiqueta, ayuda y error asociados (aria-describedby). */
export function Field({
  label,
  hint,
  error,
  errorPosition = "bottom",
  optional,
  className,
  type,
  ...props
}: FieldProps) {
  const id = useId();
  const t = useT();
  const [visible, setVisible] = useState(false);
  const describedBy =
    [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  const isPassword = type === "password";
  const isEmail = type === "email";
  const maxLength = props.maxLength ?? (isEmail ? 254 : undefined);
  const minLength = props.minLength ?? (isEmail && props.required ? 5 : undefined);
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[15px] font-medium">
        {label}
        {optional ? <span className="ml-1 font-normal text-muted">({t.common.ui.optional})</span> : null}
      </label>
      {error && errorPosition === "top" ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 flex items-center gap-1.5 text-sm font-medium text-danger"
        >
          <AlertCircle aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}
      <div className="relative mt-1.5">
        <input
          {...props}
          maxLength={maxLength}
          minLength={minLength}
          onInput={(event) => {
            props.onInput?.(event);
            if (isEmail) {
              const value = event.currentTarget.value;
              const trimmed = value.trim();
              const valid =
                value.length <= (maxLength ?? 254) &&
                (!props.required || trimmed.length >= (minLength ?? 5)) &&
                (!trimmed ||
                  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
                    trimmed,
                  ));
              event.currentTarget.setCustomValidity(valid ? "" : t.common.ui.invalidEmail);
              return;
            }
            if (type && type !== "text") return;
            const value = event.currentTarget.value;
            const valid =
              SINGLE_LINE.test(value) &&
              value.length <= (props.maxLength ?? 200) &&
              (!props.required || value.trim().length > 0);
            event.currentTarget.setCustomValidity(valid ? "" : t.common.ui.invalidText);
          }}
          onInvalid={(event) => {
            props.onInvalid?.(event);
            if (
              isEmail &&
              (event.currentTarget.validity.typeMismatch || event.currentTarget.validity.patternMismatch)
            ) {
              event.currentTarget.setCustomValidity(t.common.ui.invalidEmail);
            }
          }}
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
            onMouseDown={(e) => e.preventDefault()}
            aria-label={visible ? t.common.ui.hidePassword : t.common.ui.showPassword}
            aria-pressed={visible}
            aria-controls={id}
            className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-[var(--radius-field)] text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px]"
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
      {error && errorPosition !== "top" ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 flex items-center gap-1.5 text-sm text-danger">
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
  const t = useT();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[15px] font-medium">
        {label}
      </label>
      <textarea
        {...props}
        onInput={(event) => {
          props.onInput?.(event);
          const value = event.currentTarget.value;
          const valid = MULTI_LINE.test(value) && value.length <= (props.maxLength ?? 4000);
          event.currentTarget.setCustomValidity(valid ? "" : t.common.ui.invalidText);
        }}
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

export * from "./phone-field";
export * from "./ui/tabs";
