import { Search, SearchX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { ProfessionalCard } from "@/components/business/professional-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { categories, cities, professionals } from "@/lib/data";
import { cn } from "@/lib/utils";

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export default function Directory() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const cat = params.get("categoria") ?? "";
  const city = params.get("ciudad") ?? "";
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(t);
  }, []);

  const set = (k: string, v: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v) next.set(k, v);
        else next.delete(k);
        return next;
      },
      { replace: true },
    );

  const list = useMemo(
    () =>
      professionals.filter(
        (p) =>
          (!cat || p.category === cat) &&
          (!city || p.city === city) &&
          (!q || norm(`${p.name} ${p.profession} ${p.services.join(" ")}`).includes(norm(q))),
      ),
    [q, cat, city],
  );

  return (
    <div className="container-page py-10 sm:py-14">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Directorio de profesionales</h1>
      <p className="mt-2 max-w-2xl text-lg text-muted">
        Encuentra un negocio y reserva tu cita en línea en minutos.
      </p>

      <search className="contents">
        <form
          onSubmit={(e) => e.preventDefault()}
          className="mt-8 grid gap-3 rounded-panel border border-line/70 bg-surface p-4 shadow-card md:grid-cols-[1fr_240px_auto]"
        >
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted"
            />
            <Input
              type="search"
              aria-label="Buscar por nombre o servicio"
              placeholder="Busca por nombre o servicio"
              value={q}
              onChange={(e) => set("q", e.target.value)}
              className="pl-12"
            />
          </div>
          <Select aria-label="Localidad" value={city} onChange={(e) => set("ciudad", e.target.value)}>
            <option value="">Todas las localidades</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Button type="button" variant="soft" size="lg" onClick={() => setParams({}, { replace: true })}>
            Limpiar
          </Button>
        </form>
      </search>

      <fieldset className="scrollbar-none -mx-5 mt-5 flex gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:px-0 border-0 m-0 min-w-0">
        <legend className="sr-only">Filtrar por categoría</legend>
        {[{ id: "", label: "Todas" }, ...categories.filter((c) => c.id !== "mas")].map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={cat === c.id}
            onClick={() => set("categoria", c.id)}
            className={cn(
              "min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors",
              cat === c.id
                ? "border-primary bg-primary text-white"
                : "border-line bg-white hover:border-primary hover:bg-primary-50",
            )}
          >
            {c.label}
          </button>
        ))}
      </fieldset>

      <p aria-live="polite" className="mt-6 text-sm text-muted">
        {loading ? "Cargando…" : `${list.length} ${list.length === 1 ? "resultado" : "resultados"}`}
      </p>
      <div className="mt-3">
        {loading ? (
          <div
            role="status"
            aria-label="Cargando profesionales"
            className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
          >
            {["a", "b", "c", "d", "e", "f"].map((k) => (
              <Skeleton key={k} className="h-52 rounded-card" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No encontramos resultados"
            text="Prueba con otra búsqueda, categoría o localidad."
            action={
              <Button variant="soft" onClick={() => setParams({}, { replace: true })}>
                Quitar filtros
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
            {list.map((p) => (
              <li key={p.id}>
                <ProfessionalCard p={p} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
