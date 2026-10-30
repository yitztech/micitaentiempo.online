import { Bell, CalendarDays } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Notificación flotante «Nueva cita» del hero. */
export function NewBookingNotice({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn("flex items-center gap-4 rounded-card bg-white p-4 shadow-pop", className)}
    >
      <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-success-soft text-success-fg">
        <Bell className="size-7" aria-hidden />
      </span>
      <div className="min-w-0 text-sm">
        <p className="text-base font-bold">Nueva cita</p>
        <p className="text-muted">Ana García</p>
        <p className="text-muted">Consulta · 10:00</p>
      </div>
    </div>
  );
}

/** Tarjeta de reserva confirmada (sección de funcionalidades). */
export function BookingCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-card bg-white p-4 shadow-pop", className)}>
      <div className="flex items-center gap-3">
        <Avatar slug="maria-lopez" name="María López" className="size-12" />
        <div>
          <p className="font-bold">Corte de cabello</p>
          <p className="text-sm text-muted">María López</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-muted">
          <CalendarDays className="size-5 text-primary" aria-hidden /> Hoy · 14:30
        </span>
        <Badge tone="success">Confirmada</Badge>
      </div>
    </div>
  );
}
