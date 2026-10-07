import { pathFor } from "@mcet/i18n";
import { redirect } from "react-router";
import { Logo } from "~/components/logo";
import { Button, Card, Container } from "~/components/ui";
import { apiGet } from "~/lib/api.server";
import { postJson } from "~/lib/api-client";
import { siteContext } from "~/lib/context";
import { fmt, useRoot } from "~/lib/i18n";
import { metaFor } from "~/lib/seo";
import type { Route } from "./+types/dashboard";

/** Panel provisional: confirma la sesión; F7 construye el panel completo. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { lang } = context.get(siteContext);
  const me = await apiGet<{ name: string; email: string }>(request, "/api/v1/me");
  if (me.status === 401 || me.status === 403 || !me.body) {
    const url = new URL(request.url);
    throw redirect(`${pathFor("signIn", lang)}?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return { name: me.body.name, email: me.body.email };
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({ title: t.auth.dashboard.seoTitle, indexable: false }));

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { site, t } = useRoot();
  const d = t.auth.dashboard;
  async function signOut() {
    await postJson("/api/auth/sign-out", {}).catch(() => undefined);
    window.location.assign(pathFor("home", site.lang));
  }
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <Container className="flex h-16 items-center justify-between">
          <Logo />
          <Button variant="ghost" onClick={() => void signOut()}>
            {d.signOut}
          </Button>
        </Container>
      </header>
      <main id="contenido">
        <Container className="py-12">
          <Card className="p-8">
            <h1 className="text-2xl font-semibold">
              {fmt(d.title, { name: loaderData.name || loaderData.email })}
            </h1>
            <p className="mt-2 text-muted">{d.lead}</p>
          </Card>
        </Container>
      </main>
    </div>
  );
}
