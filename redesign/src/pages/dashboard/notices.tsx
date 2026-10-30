import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { notices } from "@/lib/data";
import { cn } from "@/lib/utils";
import { PageTitle } from "./page-title";

export default function Notices() {
  return (
    <>
      <PageTitle title="Avisos" lead="Reservas, recordatorios y cambios en tu agenda." />
      <Card>
        <ul className="divide-y divide-line/70">
          {notices.map((n) => (
            <li key={n.id} className="flex gap-4 p-5">
              <span
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-xl",
                  n.unread ? "bg-primary-50 text-primary" : "bg-cat-gray text-muted",
                )}
              >
                <n.icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  {n.title}
                  {n.unread ? <Badge tone="primary">Nuevo</Badge> : null}
                </p>
                <p className="text-muted">{n.text}</p>
                <p className="mt-1 text-xs text-muted">{n.time}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
