import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import { AppointmentCard } from "@/components/booking/appointment-card";
import { BookingCalendar, type CalendarMonth } from "@/components/booking/booking-calendar";
import { TimeSlotPicker } from "@/components/booking/time-slot-picker";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { appointments, slots } from "@/lib/data";
import { PageTitle } from "./page-title";

export default function CalendarPage() {
  const [month, setMonth] = useState<CalendarMonth>({ year: 2026, month: 9 });
  const [day, setDay] = useState<number | null>(20);
  const [slot, setSlot] = useState<string | null>("10:30");
  return (
    <>
      <PageTitle
        title="Calendario"
        lead="Tus citas y horarios disponibles."
        actions={
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <CalendarPlus /> Nueva cita
              </Button>
            </DialogTrigger>
            <DialogContent title="Nueva cita" description="Completa los datos para agendarla.">
              <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                <Field label="Cliente">{(a) => <Input {...a} placeholder="Nombre del cliente" />}</Field>
                <Field label="Servicio">
                  {(a) => (
                    <Select {...a}>
                      <option>Consulta inicial</option>
                      <option>Corte de cabello</option>
                      <option>Asesoría legal</option>
                    </Select>
                  )}
                </Field>
                <p className="text-sm font-semibold">Horario</p>
                <TimeSlotPicker slots={slots} value={slot} onChange={setSlot} taken={["09:00", "12:00"]} />
                <div className="flex justify-end gap-2 pt-2">
                  <DialogClose asChild>
                    <Button variant="ghost">Cancelar</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button type="submit">Guardar cita</Button>
                  </DialogClose>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <BookingCalendar
          value={month}
          onMonthChange={setMonth}
          selected={day}
          onSelect={setDay}
          marked={[6, 9, 13, 16, 20, 22, 27]}
          className="self-start"
        />
        <Card>
          <CardHeader>
            <CardTitle>{day ? `${day} de octubre` : "Selecciona un día"}</CardTitle>
          </CardHeader>
          <CardBody>
            {day === 20 ? (
              <ul className="space-y-2">
                {appointments.map((a) => (
                  <li key={a.id}>
                    <AppointmentCard a={a} variant="block" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-muted">Sin citas para este día.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
