import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { PageTitle } from "./page-title";

const schema = z.object({
  name: z.string().min(2, "Escribe tu nombre."),
  email: z.string().pipe(z.email("Escribe un correo válido.")),
});

export default function Account() {
  const [saved, setSaved] = useState(false);
  const f = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: "Laura Torres", email: "laura.torres@correo.com" },
  });
  const { errors } = f.formState;
  return (
    <>
      <PageTitle title="Cuenta" lead="Tus datos personales y de acceso." />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Datos personales</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="mb-5 flex items-center gap-4">
            <Avatar slug="laura-torres" name="Laura Torres" className="size-16" />
            <Badge tone="primary">Propietaria</Badge>
          </div>
          <form noValidate onSubmit={f.handleSubmit(() => setSaved(true))} className="space-y-5">
            <Field label="Nombre" error={errors.name?.message}>
              {(a) => <Input {...a} {...f.register("name")} />}
            </Field>
            <Field label="Correo electrónico" error={errors.email?.message}>
              {(a) => <Input {...a} type="email" {...f.register("email")} />}
            </Field>
            <div className="flex items-center gap-3">
              <Button type="submit">Guardar</Button>
              {saved ? (
                <Badge tone="success" role="status">
                  Guardado
                </Badge>
              ) : null}
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
