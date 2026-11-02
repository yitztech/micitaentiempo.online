import { type ComponentProps, createContext, type KeyboardEvent, useContext, useId, useState } from "react";
import { cx } from "~/lib/i18n";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error("Tabs components must be used within a <Tabs> container");
  }
  return ctx;
}

/** Contenedor raíz de pestañas estilo shadcn/ui. */
export function Tabs({
  defaultValue,
  value: controlledValue,
  onValueChange,
  className,
  children,
  ...props
}: ComponentProps<"div"> & {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const generatedId = useId();
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? "");
  const isControlled = controlledValue !== undefined;
  const activeValue = isControlled ? controlledValue : uncontrolledValue;

  function handleValueChange(val: string) {
    if (!isControlled) {
      setUncontrolledValue(val);
    }
    onValueChange?.(val);
  }

  return (
    <TabsContext.Provider
      value={{
        value: activeValue,
        onValueChange: handleValueChange,
        baseId: generatedId,
      }}
    >
      <div className={cx("w-full", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

/** Lista de disparadores de pestañas con navegación de teclado accesible (WAI-ARIA). */
export function TabsList({ className, children, ...props }: ComponentProps<"div">) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const triggers = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'),
    );
    const currentIndex = triggers.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex === -1) return;

    let nextIndex = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      nextIndex = (currentIndex + 1) % triggers.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      nextIndex = (currentIndex - 1 + triggers.length) % triggers.length;
    } else if (event.key === "Home") {
      event.preventDefault();
      nextIndex = 0;
    } else if (event.key === "End") {
      event.preventDefault();
      nextIndex = triggers.length - 1;
    }

    const target = triggers[nextIndex];
    if (nextIndex !== -1 && target) {
      target.focus();
      target.click();
    }
  }

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      className={cx(
        "inline-flex w-full items-center justify-start gap-1 rounded-[var(--radius-field)] bg-surface-2 p-1.5 text-muted border border-border/70",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Disparador de pestaña individual accesible. */
export function TabsTrigger({
  value,
  disabled,
  className,
  children,
  onClick,
  ...props
}: ComponentProps<"button"> & { value: string }) {
  const { value: activeValue, onValueChange, baseId } = useTabsContext();
  const isSelected = activeValue === value;
  const tabId = `${baseId}-tab-${value}`;
  const panelId = `${baseId}-panel-${value}`;

  return (
    <button
      type="button"
      role="tab"
      id={tabId}
      aria-selected={isSelected}
      aria-controls={panelId}
      tabIndex={isSelected ? 0 : -1}
      disabled={disabled}
      data-state={isSelected ? "active" : "inactive"}
      onClick={(e) => {
        onClick?.(e);
        if (!disabled) onValueChange(value);
      }}
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[calc(var(--radius-field)-4px)] px-3.5 py-1.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
        isSelected
          ? "bg-surface text-primary shadow-xs font-bold"
          : "text-muted hover:bg-surface/60 hover:text-text",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Panel de contenido asociado a una pestaña. Preserva el estado del formulario. */
export function TabsContent({
  value,
  className,
  children,
  ...props
}: ComponentProps<"div"> & { value: string }) {
  const { value: activeValue, baseId } = useTabsContext();
  const isSelected = activeValue === value;
  const tabId = `${baseId}-tab-${value}`;
  const panelId = `${baseId}-panel-${value}`;

  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId}
      hidden={!isSelected}
      data-state={isSelected ? "active" : "inactive"}
      className={cx(
        !isSelected && "hidden",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
