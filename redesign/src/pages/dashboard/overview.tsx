import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { BookingLinkCard } from "@/components/dashboard/booking-link-card";
import { CalendarOverview } from "@/components/dashboard/calendar-overview";
import { MetricCard } from "@/components/dashboard/metric-card";
import { UpcomingAppointments } from "@/components/dashboard/upcoming-appointments";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { appointments, metrics } from "@/lib/data";
import { PageTitle } from "./page-title";

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export default function Overview() {
  const [m, setM] = useState(9);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(t);
  }, []);
  const step = (n: number) => setM((x) => (x + n + 12) % 12);
  return (
    <>
      <PageTitle
        title="Hola, Laura"
        lead="Aquí tienes un resumen de tu negocio."
        actions={
          <div className="flex items-center rounded-field border border-line bg-white">
            <Button variant="ghost" size="icon" aria-label="Mes anterior" onClick={() => step(-1)}>
              <ChevronLeft />
            </Button>
            <span className="min-w-32 text-center text-sm font-semibold" aria-live="polite">
              {MONTHS[m]} 2026
            </span>
            <Button variant="ghost" size="icon" aria-label="Mes siguiente" onClick={() => step(1)}>
              <ChevronRight />
            </Button>
          </div>
        }
      />
      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {loading
          ? ["a", "b", "c", "d"].map((k) => <Skeleton key={k} className="h-36 rounded-card" />)
          : metrics.map((x) => <MetricCard key={x.label} {...x} />)}
      </section>
      <div className="mt-5 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
        <CalendarOverview />
        <div className="space-y-5">
          <UpcomingAppointments items={appointments} loading={loading} />
          <BookingLinkCard />
          <ActivityFeed limit={3} />
        </div>
      </div>
    </>
  );
}
