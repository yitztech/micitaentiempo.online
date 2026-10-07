import { useEffect, useState } from "react";
import { data } from "react-router";
import { BookingFlow } from "~/components/booking-flow";
import { MyAppointments } from "~/components/my-appointments";
import { nonceContext } from "~/lib/context";
import { cx, fmt, useRoot } from "~/lib/i18n";
import { loadPublicCalendar } from "~/lib/public-calendar.server";
import { contentSecurityPolicy } from "~/lib/security.server";
import { metaFor } from "~/lib/seo";
import type { Route } from "./+types/embed";

/** frame-ancestors según la política del tablero: cualquier sitio o una lista (07-frontend.md §7.6). */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const calendar = await loadPublicCalendar(request, params.slug);
  const ancestors =
    calendar.embedPolicy.mode === "allowlist" ? ["'self'", ...calendar.embedPolicy.origins].join(" ") : "*";
  const headers = new Headers({
    "Content-Security-Policy": contentSecurityPolicy(context.get(nonceContext), {
      frameAncestors: ancestors,
      google: true,
    }),
  });
  return data({ calendar }, { headers });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return { "Content-Security-Policy": loaderHeaders.get("Content-Security-Policy") ?? "" };
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({
    title: fmt(t.booking.seoTitle, { name: args.loaderData?.calendar.name ?? "" }),
    indexable: false,
  }));

/** Avisa a la página anfitriona de la altura y de las reservas (sin datos personales). */
function post(message: Record<string, unknown>) {
  if (window.parent !== window) window.parent.postMessage({ source: "micita", ...message }, "*");
}

/** Reserva y «Mis citas» dentro de un iframe en la web del negocio. Sin analítica. */
export default function Embed({ loaderData }: Route.ComponentProps) {
  const { t } = useRoot();
  const { calendar } = loaderData;
  const [view, setView] = useState<"book" | "mine">("book");
  useEffect(() => {
    const ro = new ResizeObserver(() =>
      post({ type: "micita:height", height: document.documentElement.scrollHeight }),
    );
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);
  return (
    <main id="contenido" className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{calendar.name}</h1>
        <div
          role="tablist"
          className="flex rounded-[var(--radius-field)] border border-border p-1 text-[15px]"
        >
          {(["book", "mine"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cx(
                "min-h-10 rounded-md px-3",
                view === v ? "bg-primary text-on-primary" : "hover:bg-surface-2",
              )}
            >
              {v === "book" ? t.booking.embed.book : t.booking.embed.myAppointments}
            </button>
          ))}
        </div>
      </div>
      {view === "book" ? (
        <BookingFlow
          calendar={calendar}
          myAppointmentsHref=""
          onMyAppointments={() => setView("mine")}
          onConfirmed={(b, service) =>
            post({
              type: "micita:booking_confirmed",
              booking: { id: b.id, start: b.start, end: b.end, service },
            })
          }
        />
      ) : (
        <MyAppointments />
      )}
      <p className="mt-8 text-center text-xs text-muted">{t.booking.embed.poweredBy}</p>
    </main>
  );
}
