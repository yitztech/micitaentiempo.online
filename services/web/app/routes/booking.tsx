import { pathFor } from "@mcet/i18n";
import { MapPin } from "lucide-react";
import { BookingFlow } from "~/components/booking-flow";
import { LanguageLink } from "~/components/language-link";
import { Logo } from "~/components/logo";
import { Container } from "~/components/ui";
import { fmt, useRoot } from "~/lib/i18n";
import { loadPublicCalendar } from "~/lib/public-calendar.server";
import { metaFor } from "~/lib/seo";
import type { Route } from "./+types/booking";

export async function loader({ request, params }: Route.LoaderArgs) {
  return { calendar: await loadPublicCalendar(request, params.slug) };
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({
    title: fmt(t.booking.seoTitle, { name: args.loaderData?.calendar.name ?? "" }),
    indexable: false,
  }));

/** Página pública de reserva (noindex), pensada primero para móvil. */
export default function BookingPage({ loaderData }: Route.ComponentProps) {
  const { site, t } = useRoot();
  const { calendar } = loaderData;
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <Container className="flex h-16 items-center justify-between">
          <Logo />
          <LanguageLink />
        </Container>
      </header>
      <main id="contenido">
        <Container className="max-w-4xl py-8 sm:py-12">
          <h1 className="text-3xl font-semibold tracking-tight">{calendar.name}</h1>
          {calendar.address ? (
            <p className="mt-2 flex items-center gap-2 text-muted">
              <MapPin aria-hidden className="size-4" />
              {calendar.address}
            </p>
          ) : null}
          <div className="mt-8">
            <BookingFlow calendar={calendar} myAppointmentsHref={pathFor("myAppointments", site.lang)} />
          </div>
          <p className="mt-12 text-center text-sm text-muted">{t.booking.embed.poweredBy}</p>
        </Container>
      </main>
    </div>
  );
}
