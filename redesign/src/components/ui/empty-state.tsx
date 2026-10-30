import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-primary-200 bg-white/60 px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-primary-50 text-primary">
        <Icon className="size-7" aria-hidden />
      </span>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      <p className="mt-1 max-w-sm text-muted">{text}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
