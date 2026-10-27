import { categoryLabel, pathFor } from "@mcet/i18n";
import type { PublicBusinessProfile } from "@mcet/schemas";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  MapPin,
} from "lucide-react";
import { data, Link } from "react-router";
import { Badge, Card, Container, LinkButton } from "~/components/ui";
import { apiGet } from "~/lib/api.server";
import { fmt, useRoot } from "~/lib/i18n";
import { metaFor, publicCacheHeaders } from "~/lib/seo";
import type { Route } from "./+types/business-profile";

export async function loader({ request, params }: Route.LoaderArgs) {
  const businessId = params.id;
  if (!businessId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId)) {
    throw data(null, { status: 404, statusText: "Not Found" });
  }

  const res = await apiGet<PublicBusinessProfile>(request, `/api/public/v1/businesses/${businessId}`);
  if (res.status !== 200 || !res.body) {
    throw data(null, { status: res.status === 404 ? 404 : 502, statusText: "Not Found" });
  }

  return { profile: res.body };
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({
    title: fmt(t.public.businessProfile.seoTitle, { name: args.loaderData?.profile.displayName ?? "" }),
    description: fmt(t.public.businessProfile.seoDescription, {
      name: args.loaderData?.profile.displayName ?? "",
    }),
    indexable: true,
  }));

export const headers = () => publicCacheHeaders;

export default function BusinessProfilePage({ loaderData }: Route.ComponentProps) {
  const { profile } = loaderData;
  const { site, t, nonce } = useRoot();
  const p = t.public.businessProfile;

  // Mapa de calendarios para enlazar reservas de servicios
  const calendarTargets = new Map(profile.bookingTargets.map((bt) => [bt.calendarId, bt.slug]));

  // JSON-LD para SEO local
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: profile.displayName,
    description: profile.description,
    url: `${site.siteUrl}${pathFor("businessProfile", site.lang, { id: profile.businessId })}`,
    image: profile.images.map((img) => img.url),
    address: profile.locations.map((loc) => ({
      "@type": "PostalAddress",
      streetAddress: loc.addressVisibility === "public" ? loc.address : undefined,
      addressLocality: loc.locality,
      addressRegion: loc.region,
      postalCode: loc.addressVisibility === "public" ? loc.postalCode : undefined,
      addressCountry: loc.country,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD de datos públicos validados
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <Container className="py-8 sm:py-12">
        {/* Enlace de regreso */}
        <Link
          to={pathFor("businessDirectory", site.lang)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text transition-colors mb-6"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {p.backToDirectory}
        </Link>

        {/* Encabezado / Hero del perfil */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-success-soft text-success border border-success/30">
                  <CheckCircle2 aria-hidden className="size-3.5" />
                  {p.verified}
                </Badge>
                <Badge>{categoryLabel(profile.primaryCategory, site.lang)}</Badge>
                {profile.secondaryCategories.map((c) => (
                  <Badge key={c} className="bg-surface-2 text-muted">
                    {categoryLabel(c, site.lang)}
                  </Badge>
                ))}
              </div>

              <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-text">
                {profile.displayName}
              </h1>

              <div className="mt-4 whitespace-pre-line text-base text-muted leading-relaxed">
                {profile.description}
              </div>
            </div>

            {/* Enlaces y redes sociales */}
            <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-border/70 text-sm">
              {profile.websiteUrl ? (
                <a
                  href={profile.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                >
                  <Globe aria-hidden className="size-4" />
                  {p.website}
                  <ExternalLink aria-hidden className="size-3" />
                </a>
              ) : null}

              {profile.termsUrl ? (
                <a
                  href={profile.termsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-muted hover:text-text hover:underline"
                >
                  <FileText aria-hidden className="size-4" />
                  {p.terms}
                  <ExternalLink aria-hidden className="size-3" />
                </a>
              ) : null}

              {profile.socialLinks.map((s) => (
                <a
                  key={s.platform}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 font-medium text-muted hover:text-text hover:bg-surface-2 transition-colors capitalize"
                >
                  {s.platform}
                  <ExternalLink aria-hidden className="size-3" />
                </a>
              ))}
            </div>

            {/* Galería de fotos */}
            {profile.images.length > 0 ? (
              <section aria-label={p.gallery} className="mt-4">
                <h2 className="text-xl font-semibold tracking-tight">{p.gallery}</h2>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {profile.images.map((img) => (
                    <div
                      key={img.id}
                      className="relative aspect-video overflow-hidden rounded-[var(--radius-card)] bg-surface-2"
                    >
                      <img
                        src={img.url}
                        alt={img.alt || profile.displayName}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                      />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Sedes */}
            <section aria-label={p.locations} className="mt-6">
              <h2 className="text-xl font-semibold tracking-tight">{p.locations}</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {profile.locations.map((loc) => {
                  const isLocalityOnly = loc.addressVisibility === "locality";
                  return (
                    <Card key={loc.id} className="p-4 flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 font-semibold text-text">
                        <MapPin aria-hidden className="size-4 text-primary shrink-0" />
                        <span>{loc.name}</span>
                      </div>
                      {isLocalityOnly ? (
                        <p className="text-sm text-muted">
                          {fmt(p.addressLocalityOnly, { locality: `${loc.locality}, ${loc.country}` })}
                        </p>
                      ) : (
                        <div className="text-sm text-muted leading-snug">
                          <p>{loc.address}</p>
                          <p>
                            {loc.postalCode ? `${loc.postalCode} ` : ""}
                            {loc.locality}
                            {loc.region ? `, ${loc.region}` : ""}, {loc.country}
                          </p>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Columna derecha: Servicios y Agendamiento */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 flex flex-col gap-6">
              <Card className="p-6">
                <h2 className="text-xl font-semibold tracking-tight">{p.services}</h2>

                {profile.services.length === 0 ? (
                  <p className="mt-4 text-sm text-muted">{p.noServices}</p>
                ) : (
                  <div className="mt-4 flex flex-col divide-y divide-border/60">
                    {profile.services.map((srv) => {
                      const calendarSlug = calendarTargets.get(srv.calendarId);
                      const bookingHref = calendarSlug
                        ? `${pathFor("booking", site.lang, { slug: calendarSlug })}?serviceId=${encodeURIComponent(srv.serviceId)}`
                        : null;

                      return (
                        <div key={`${srv.calendarId}-${srv.serviceId}`} className="py-4 first:pt-0 last:pb-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="font-semibold text-text">{srv.name}</h3>
                              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                                <Clock aria-hidden className="size-3.5" />
                                {srv.durationMinutes} min
                              </p>
                            </div>
                            {bookingHref ? (
                              <LinkButton
                                to={bookingHref}
                                size="md"
                                variant="primary"
                                className="shrink-0 text-sm"
                              >
                                <Calendar aria-hidden className="size-3.5" />
                                {p.bookService}
                              </LinkButton>
                            ) : null}
                          </div>
                          {srv.description ? (
                            <p className="mt-2 text-xs text-muted leading-relaxed">{srv.description}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      </Container>
    </>
  );
}
