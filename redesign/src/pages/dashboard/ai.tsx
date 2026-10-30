import { Bot, Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PageTitle } from "./page-title";

export default function AiIntegrations() {
  return (
    <>
      <PageTitle
        title="Integraciones de IA"
        lead="Conecta tu asistente de IA para consultar y gestionar tu agenda."
      />
      <div className="grid max-w-4xl gap-5 md:grid-cols-2">
        {[
          ["Asistente de IA", "Conéctalo con tu cuenta para consultar tus citas."],
          ["Clave de acceso", "Genera una clave para tus herramientas de IA."],
        ].map(([t, d], i) => (
          <Card key={t}>
            <CardBody className="p-6">
              <span className="grid size-12 place-items-center rounded-2xl bg-primary-50 text-primary">
                {i === 0 ? <Bot className="size-6" aria-hidden /> : <Plug className="size-6" aria-hidden />}
              </span>
              <h2 className="mt-4 text-lg font-bold">{t}</h2>
              <p className="mt-1 text-muted">{d}</p>
              <div className="mt-5 flex items-center gap-3">
                <Button variant="soft">Configurar</Button>
                <Badge tone="neutral">Sin conectar</Badge>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
