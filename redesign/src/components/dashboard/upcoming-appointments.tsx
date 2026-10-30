import { CalendarX2 } from "lucide-react";
import { Link } from "react-router";
import { AppointmentCard } from "@/components/booking/appointment-card";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { Appointment } from "@/lib/data";

export function UpcomingAppointments({ items, loading }: { items: Appointment[]; loading?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Próximas citas</CardTitle>
        <Link to="/panel/calendario" className="text-sm font-semibold text-primary hover:underline">
          Ver todas
        </Link>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="space-y-3" role="status" aria-label="Cargando citas">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={CalendarX2}
            title="Sin citas próximas"
            text="Cuando alguien reserve, aparecerá aquí."
          />
        ) : (
          <ul className="divide-y divide-line/70">
            {items.map((a) => (
              <li key={a.id} className="py-1">
                <AppointmentCard a={a} />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
