import { ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Appointment } from "@/lib/data";
import { cn } from "@/lib/utils";

export const toneBlock: Record<Appointment["tone"], string> = {
  blue: "bg-cat-blue border-blue text-[#1e3a8a]",
  teal: "bg-cat-teal border-success text-[#115e59]",
  orange: "bg-cat-orange border-[#ea580c] text-[#9a3412]",
  violet: "bg-cat-violet border-violet text-[#4c1d95]",
};

/** Fila de cita: variante `block` (franja de color, para el día) y `row` (avatar + datos). */
export function AppointmentCard({
  a,
  variant = "row",
  className,
}: {
  a: Appointment;
  variant?: "row" | "block";
  className?: string;
}) {
  if (variant === "block") {
    return (
      <div
        className={cn(
          "flex items-center gap-4 rounded-xl border-l-4 px-4 py-3",
          toneBlock[a.tone],
          className,
        )}
      >
        <span className="w-12 shrink-0 text-sm font-bold tabular-nums">{a.time}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{a.title}</p>
          <p className="truncate text-xs">{a.client}</p>
        </div>
      </div>
    );
  }
  return (
    <div className={cn("flex min-h-14 items-center gap-3", className)}>
      <span className="w-11 shrink-0 text-xs font-semibold tabular-nums text-muted">{a.time}</span>
      <Avatar slug={a.avatar} name={a.client} className="size-10" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{a.client}</p>
        <p className="truncate text-xs text-muted">{a.title}</p>
      </div>
      <Badge tone={a.status === "confirmada" ? "success" : "warning"} className="hidden sm:inline-flex">
        {a.status === "confirmada" ? "Confirmada" : "Pendiente"}
      </Badge>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
    </div>
  );
}
