import type { ReactNode } from "react";

export function PageTitle({ title, lead, actions }: { title: string; lead?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {lead ? <p className="mt-1 text-muted">{lead}</p> : null}
      </div>
      {actions}
    </div>
  );
}
