import { ArrowUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function MetricCard({
  icon: Icon,
  label,
  value,
  delta,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  delta?: string;
  tone: string;
}) {
  return (
    <div className="rounded-card border border-line/70 bg-surface p-4 shadow-card">
      <span className={cn("grid size-10 place-items-center rounded-xl", tone)}>
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="mt-3 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="text-sm text-muted">{label}</p>
      {delta ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-success-fg">
          <ArrowUp className="size-3" aria-hidden /> {delta}
        </p>
      ) : null}
    </div>
  );
}
