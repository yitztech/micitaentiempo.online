import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { fieldClass } from "./input";

/** Select nativo con el estilo de los campos (accesible y táctil en móvil). */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(fieldClass, "appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
}
