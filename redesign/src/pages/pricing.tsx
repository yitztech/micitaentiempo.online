import { Check } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { plans } from "@/lib/data";

export default function Pricing() {
  return (
    <div className="container-page py-12 sm:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
          Precios simples, <span className="gradient-text">sin sorpresas</span>
        </h1>
        <p className="mt-4 text-lg text-muted">
          Elige según cuántas agendas necesitas. Empieza con 30 días de prueba con todas las funciones.
        </p>
      </div>
      <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
        {plans.map((p) => (
          <section
            key={p.id}
            aria-labelledby={`plan-${p.id}`}
            className="flex flex-col rounded-panel border border-line/70 bg-surface p-7 shadow-card"
          >
            <h2 id={`plan-${p.id}`} className="text-xl font-bold">
              {p.name}
            </h2>
            <p className="mt-1 text-muted">{p.audience}</p>
            <p className="mt-6 flex items-end gap-2">
              <span className="text-5xl font-extrabold tracking-tight">{p.price}</span>
              <span className="pb-1.5 text-muted">{p.period}</span>
            </p>
            <ul className="mt-6 flex-1 space-y-3">
              {p.items.map((i) => (
                <li key={i} className="flex items-start gap-3">
                  <Check className="mt-0.5 size-5 shrink-0 text-success-fg" aria-hidden /> {i}
                </li>
              ))}
            </ul>
            <Button asChild size="lg" variant="outline" className="mt-8">
              <Link to="/registro">{p.cta}</Link>
            </Button>
          </section>
        ))}
      </div>
      <p className="mx-auto mt-6 max-w-xl text-center text-sm text-muted">
        Precios en dólares estadounidenses. Los impuestos pueden variar según tu país.
      </p>
    </div>
  );
}
