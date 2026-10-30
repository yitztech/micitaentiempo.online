import { useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { PageTitle } from "./page-title";

const rows = [
  ["reserva", "Nueva reserva", "Cuando un cliente reserva una cita."],
  ["cambio", "Cambios y cancelaciones", "Cuando una cita se mueve o se cancela."],
  ["recordatorio", "Recordatorios a clientes", "Aviso automático antes de cada cita."],
  ["resumen", "Resumen diario", "Tus citas del día cada mañana."],
] as const;

export default function NotificationSettings() {
  const [on, setOn] = useState<Record<string, boolean>>({
    reserva: true,
    cambio: true,
    recordatorio: true,
    resumen: false,
  });
  return (
    <>
      <PageTitle
        title="Preferencias de avisos"
        lead="Elige qué avisos recibes y cuáles envías a tus clientes."
      />
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Avisos por correo</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="divide-y divide-line/70">
            {rows.map(([id, title, text]) => (
              <li key={id} className="flex items-center justify-between gap-4 py-4">
                <div>
                  <p id={`l-${id}`} className="font-semibold">
                    {title}
                  </p>
                  <p className="text-sm text-muted">{text}</p>
                </div>
                <Switch
                  aria-labelledby={`l-${id}`}
                  checked={!!on[id]}
                  onCheckedChange={(v) => setOn((s) => ({ ...s, [id]: v }))}
                />
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </>
  );
}
