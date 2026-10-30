import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Tarjeta con icono de beneficio/funcionalidad (franja de beneficios y página de funciones). */
export function BusinessCard({
  icon: Icon,
  title,
  text,
  tone = "bg-primary-50 text-primary",
  className,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-4", className)}>
      <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", tone)}>
        <Icon className="size-6" aria-hidden />
      </span>
      <div>
        <h3 className="text-sm font-bold sm:text-[15px]">{title}</h3>
        <p className="mt-0.5 text-sm leading-snug text-muted">{text}</p>
      </div>
    </div>
  );
}
