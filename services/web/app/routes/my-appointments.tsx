import { ClientHeader } from "~/components/client-header";
import { MyAppointments } from "~/components/my-appointments";
import { Container } from "~/components/ui";
import { useRoot } from "~/lib/i18n";
import { metaFor } from "~/lib/seo";
import type { Route } from "./+types/my-appointments";

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.booking.my.seoTitle, indexable: false }));

export default function MyAppointmentsPage() {
  const { t } = useRoot();
  return (
    <div className="min-h-dvh">
      <ClientHeader showMyAppointments={false} />
      <main id="contenido">
        <Container width="prose" className="py-8 sm:py-12">
          <h1 className="mb-6 text-3xl font-semibold tracking-tight">{t.booking.my.title}</h1>
          <MyAppointments />
        </Container>
      </main>
    </div>
  );
}
