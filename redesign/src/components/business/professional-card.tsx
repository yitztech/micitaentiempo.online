import { MapPin, Star } from "lucide-react";
import { Link } from "react-router";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { categories, type Professional } from "@/lib/data";

/** Tarjeta de profesional del directorio con servicios y enlace para reservar. */
export function ProfessionalCard({ p }: { p: Professional }) {
  const cat = categories.find((c) => c.id === p.category);
  return (
    <Card className="flex h-full flex-col p-5 transition-shadow hover:shadow-pop">
      <div className="flex items-start gap-4">
        <Avatar slug={p.avatar} name={p.name} className="size-14" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold">{p.name}</h3>
          <p className="truncate text-sm text-muted">{p.profession}</p>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted">
            <MapPin className="size-3.5" aria-hidden /> {p.city}
          </p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-warning-soft px-2 py-1 text-xs font-bold text-warning-fg">
          <Star className="size-3.5 fill-current" aria-hidden /> {p.rating}
          <span className="sr-only"> de 5, {p.reviews} opiniones</span>
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {cat ? <Badge tone="primary">{cat.label}</Badge> : null}
        {p.services.slice(0, 2).map((s) => (
          <Badge key={s} tone="neutral" className="font-medium">
            {s}
          </Badge>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <p className="text-sm text-muted">
          Desde <strong className="text-base text-ink">{p.from}</strong>
        </p>
        <Button asChild size="sm">
          <Link to={`/reservar/${p.slug}`}>Reservar</Link>
        </Button>
      </div>
    </Card>
  );
}
