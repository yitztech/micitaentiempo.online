import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { notices } from "@/lib/data";
import { cn } from "@/lib/utils";

export function ActivityFeed({ limit = 4 }: { limit?: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Actividad reciente</CardTitle>
      </CardHeader>
      <CardBody>
        <ul className="space-y-1">
          {notices.slice(0, limit).map((n) => (
            <li key={n.id} className="flex gap-3 rounded-xl p-2.5">
              <span
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-xl",
                  n.unread ? "bg-primary-50 text-primary" : "bg-cat-gray text-muted",
                )}
              >
                <n.icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{n.title}</p>
                <p className="text-sm text-muted">{n.text}</p>
                <p className="mt-0.5 text-xs text-muted">{n.time}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
