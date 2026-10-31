import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { categories, cities } from "@/lib/data";
import { PageTitle } from "./page-title";

const schema = z.object({
  name: z.string().min(2, "Escribe el nombre del negocio."),
  slug: z.string().regex(/^[a-z0-9-]{3,}$/, "Usa minúsculas, números o guiones (mínimo 3)."),
  category: z.string().min(1, "Elige una categoría."),
  city: z.string().min(1, "Elige una localidad."),
  about: z.string().max(280, "Máximo 280 caracteres."),
});

export default function BusinessProfile() {
  const [saved, setSaved] = useState(false);
  const f = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "Clínica Patitas",
      slug: "clinica-patitas",
      category: "veterinarias",
      city: "Monterrey",
      about: "",
    },
  });
  const { errors } = f.formState;
  return (
    <>
      <PageTitle
        title="Perfil del negocio"
        lead="Lo que verán tus clientes en tu página de reservas y en el directorio."
      />
      <form
        noValidate
        onSubmit={f.handleSubmit(() => setSaved(true))}
        className="grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"
      >
        <Card>
          <CardHeader>
            <CardTitle>Datos del negocio</CardTitle>
          </CardHeader>
          <CardBody className="space-y-5">
            <Field label="Nombre" error={errors.name?.message}>
              {(a) => <Input {...a} {...f.register("name")} />}
            </Field>
            <Field label="Enlace público" hint="micitaentiempo.online/…" error={errors.slug?.message}>
              {(a) => <Input {...a} {...f.register("slug")} />}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Categoría" error={errors.category?.message}>
                {(a) => (
                  <Select {...a} {...f.register("category")}>
                    {categories
                      .filter((c) => c.id !== "mas")
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
              <Field label="Localidad" error={errors.city?.message}>
                {(a) => (
                  <Select {...a} {...f.register("city")}>
                    {cities.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <Field label="Descripción" error={errors.about?.message}>
              {(a) => <Textarea {...a} {...f.register("about")} />}
            </Field>
            <div className="flex items-center gap-3">
              <Button type="submit">Guardar cambios</Button>
              {saved ? (
                <Badge tone="success" role="status">
                  Cambios guardados
                </Badge>
              ) : null}
            </div>
          </CardBody>
        </Card>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Visibilidad</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-muted">
              Tu negocio aparece en el directorio cuando el perfil está completo.
            </p>
          </CardBody>
        </Card>
      </form>
    </>
  );
}
