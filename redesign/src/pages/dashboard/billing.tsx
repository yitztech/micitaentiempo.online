import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { plans } from "@/lib/data";
import { PageTitle } from "./page-title";

export default function Billing() {
  return (
    <>
      <PageTitle title="Facturación" lead="Tu plan y la prueba gratuita." />
      <div className="grid max-w-5xl gap-5 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Prueba gratuita</CardTitle>
            <Badge tone="success">Activa</Badge>
          </CardHeader>
          <CardBody>
            <p className="text-muted">
              Usas todas las funciones durante 30 días, sin tarjeta. Al terminar, si no eliges un plan, tu
              cuenta queda en solo lectura: no pierdes tus datos.
            </p>
            <p className="mt-3 text-sm text-muted">
              El pago en línea estará disponible pronto. Mientras tanto, tu prueba sigue activa.
            </p>
          </CardBody>
        </Card>
        {plans.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle>{p.name}</CardTitle>
              <span className="font-extrabold">
                {p.price} <span className="text-sm font-medium text-muted">{p.period}</span>
              </span>
            </CardHeader>
            <CardBody>
              <ul className="space-y-2">
                {p.items.map((i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <Check className="size-4 shrink-0 translate-y-0.5 text-success-fg" aria-hidden />
                    {i}
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="mt-5 w-full" disabled>
                Elegir plan
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
