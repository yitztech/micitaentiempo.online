import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Card } from "~/components/ui";
import { useRoot } from "~/lib/i18n";
import { panelGet } from "~/lib/panel.server";
import { metaFor } from "~/lib/seo";
import type { Route } from "./+types/customers";

interface Customer {
  id: string;
  name: string;
  email: string;
  firstBookingAt: string;
  lastBookingAt: string;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  return { customers: await panelGet<Customer[]>(request, context, "/api/v1/customers") };
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.panel.customers.seoTitle, indexable: false }));

/** Clientes finales del negocio (propietario y editores). */
export default function Customers({ loaderData }: Route.ComponentProps) {
  const { site, t } = useRoot();
  const c = t.panel.customers;
  const [q, setQ] = useState("");
  const date = (iso: string) =>
    new Intl.DateTimeFormat(site.lang === "es" ? "es-MX" : "en-US", { dateStyle: "medium" }).format(
      new Date(iso),
    );
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return loaderData.customers.filter(
      (x) => !n || x.name.toLowerCase().includes(n) || x.email.toLowerCase().includes(n),
    );
  }, [q, loaderData.customers]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{c.title}</h1>
      <label className="relative block max-w-md">
        <span className="sr-only">{c.search}</span>
        <Search aria-hidden className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={c.search}
          className="min-h-11 w-full rounded-[var(--radius-field)] border border-border bg-surface pl-9 pr-3 text-base"
        />
      </label>
      {list.length === 0 ? (
        <p className="text-muted">{c.empty}</p>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-[15px]">
            <thead className="border-b border-border text-sm text-muted">
              <tr>
                <th scope="col" className="p-3 font-medium">
                  {c.name}
                </th>
                <th scope="col" className="p-3 font-medium">
                  {c.email}
                </th>
                <th scope="col" className="p-3 font-medium">
                  {c.first}
                </th>
                <th scope="col" className="p-3 font-medium">
                  {c.last}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((x) => (
                <tr key={x.id}>
                  <td className="p-3 font-medium">{x.name}</td>
                  <td className="p-3">{x.email}</td>
                  <td className="p-3 tabular">{date(x.firstBookingAt)}</td>
                  <td className="p-3 tabular">{date(x.lastBookingAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
