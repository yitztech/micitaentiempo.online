import { Search, UsersRound } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { customers } from "@/lib/data";
import { PageTitle } from "./page-title";

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Tabla en pantallas anchas; tarjetas apiladas en móvil. */
export default function Customers() {
  const [q, setQ] = useState("");
  const list = customers.filter((c) => norm(`${c.name} ${c.contact}`).includes(norm(q)));
  return (
    <>
      <PageTitle title="Clientes" lead={`${customers.length} clientes registrados.`} />
      <div className="relative mb-4 max-w-md">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted"
        />
        <Input
          type="search"
          aria-label="Buscar clientes"
          placeholder="Buscar por nombre o correo"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-12"
        />
      </div>
      {list.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Sin resultados"
          text="Ningún cliente coincide con tu búsqueda."
        />
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Clientes</caption>
              <thead className="bg-primary-50/60 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3">
                    Cliente
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Contacto
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Visitas
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Última visita
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {list.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3 font-semibold">
                        <Avatar slug={c.avatar} name={c.name} className="size-9" />
                        {c.name}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {c.contact}
                      <br />
                      {c.phone}
                    </td>
                    <td className="px-5 py-3 tabular-nums">{c.visits}</td>
                    <td className="px-5 py-3 text-muted">{c.last}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <ul className="space-y-3 md:hidden">
            {list.map((c) => (
              <li key={c.id} className="rounded-card border border-line/70 bg-surface p-4 shadow-card">
                <div className="flex items-center gap-3">
                  <Avatar slug={c.avatar} name={c.name} className="size-11" />
                  <div className="min-w-0">
                    <p className="font-bold">{c.name}</p>
                    <p className="truncate text-sm text-muted">{c.contact}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted">
                  {c.visits} visitas · última {c.last}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
