import { categoryLabel, pathFor } from "@mcet/i18n";
import type { BusinessDirectoryPage, CategoryPage, LocalityPage, PublicBusinessSummary } from "@mcet/schemas";
import { Building2, Calendar, MapPin, Navigation, Search, X } from "lucide-react";
import { useState } from "react";
import { Form, Link, useNavigation, useSearchParams } from "react-router";
import { Select } from "~/components/select";
import { Badge, Button, Card, Container, Field, LinkButton } from "~/components/ui";
import { apiGet } from "~/lib/api.server";
import { cx, fmt, useRoot } from "~/lib/i18n";
import { metaFor, publicCacheHeaders } from "~/lib/seo";
import type { Route } from "./+types/business-directory";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const category = url.searchParams.get("category")?.trim() || "";
  const locality = url.searchParams.get("locality")?.trim() || "";
  const country = url.searchParams.get("country")?.trim() || "";
  const latStr = url.searchParams.get("lat")?.trim() || "";
  const lngStr = url.searchParams.get("lng")?.trim() || "";
  const radiusKmStr = url.searchParams.get("radiusKm")?.trim() || "";
  const cursor = url.searchParams.get("cursor")?.trim() || "";

  const apiParams = new URLSearchParams();
  if (q) apiParams.set("q", q);
  if (category) apiParams.set("category", category);
  if (locality) apiParams.set("locality", locality);
  if (country) apiParams.set("country", country);
  if (latStr) apiParams.set("lat", latStr);
  if (lngStr) apiParams.set("lng", lngStr);
  if (radiusKmStr) apiParams.set("radiusKm", radiusKmStr);
  if (cursor) apiParams.set("cursor", cursor);
  apiParams.set("limit", "20");

  const [categoriesRes, businessesRes, localitiesRes] = await Promise.all([
    apiGet<CategoryPage>(request, "/api/public/v1/business-categories?limit=50"),
    apiGet<BusinessDirectoryPage>(request, `/api/public/v1/businesses?${apiParams.toString()}`),
    apiGet<LocalityPage>(request, "/api/public/v1/business-localities?limit=100"),
  ]);

  const categories = categoriesRes.body?.items ?? [];
  const businesses = businessesRes.body?.items ?? [];
  const nextCursor = businessesRes.body?.nextCursor ?? null;
  const localities = localitiesRes.body?.items ?? [];

  return {
    categories,
    businesses,
    nextCursor,
    localities,
    filters: {
      q,
      category,
      locality,
      country,
      lat: latStr,
      lng: lngStr,
      radiusKm: radiusKmStr,
    },
  };
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({
    title: t.public.directory.seoTitle,
    description: t.public.directory.seoDescription,
    indexable: true,
  }));

export const headers = () => publicCacheHeaders;

export default function BusinessDirectory({ loaderData }: Route.ComponentProps) {
  const { categories, businesses, nextCursor, localities, filters } = loaderData;
  const { site, t } = useRoot();
  const d = t.public.directory;
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const isSearching = navigation.state === "loading";

  const [geoLocating, setGeoLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const hasActiveFilters = Boolean(
    filters.q || filters.category || filters.locality || filters.country || filters.lat || filters.lng,
  );

  function handleNearMe() {
    if (!navigator.geolocation) {
      setGeoError(d.geoError);
      return;
    }
    setGeoLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLocating(false);
        const url = new URL(window.location.href);
        url.searchParams.set("lat", pos.coords.latitude.toFixed(6));
        url.searchParams.set("lng", pos.coords.longitude.toFixed(6));
        url.searchParams.delete("locality");
        url.searchParams.delete("country");
        url.searchParams.delete("cursor");
        window.location.href = url.toString();
      },
      () => {
        setGeoLocating(false);
        setGeoError(d.geoError);
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  }

  return (
    <Container className="py-10 sm:py-14">
      {/* Encabezado */}
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{d.title}</h1>
        <p className="mt-3 text-lg text-muted">{d.lead}</p>
      </div>

      {/* Barra de búsqueda y filtros */}
      <Card className="mt-8 p-4 sm:p-6">
        <Form method="get" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Texto de búsqueda */}
            <div className="lg:col-span-2">
              <Field
                label={d.searchPlaceholder}
                name="q"
                type="text"
                defaultValue={filters.q}
                placeholder={d.searchPlaceholder}
                maxLength={100}
              />
            </div>

            {/* Categoría */}
            <Select label={d.categoryLabel} name="category" defaultValue={filters.category}>
              <option value="">{d.categoryAll}</option>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {categoryLabel(c.code, site.lang)}
                </option>
              ))}
            </Select>

            {/* Localidad */}
            <Select label={d.localityLabel} name="locality" defaultValue={filters.locality}>
              <option value="">{d.localityAll}</option>
              {localities.map((loc) => (
                <option key={`${loc.country}-${loc.locality}`} value={loc.locality}>
                  {loc.locality} ({loc.country})
                </option>
              ))}
            </Select>
          </div>

          {/* Ocultos si venían por geolocalización */}
          {filters.lat ? <input type="hidden" name="lat" value={filters.lat} /> : null}
          {filters.lng ? <input type="hidden" name="lng" value={filters.lng} /> : null}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/60">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary" loading={isSearching}>
                <Search aria-hidden className="size-4" />
                {d.filters}
              </Button>

              <button
                type="button"
                onClick={handleNearMe}
                disabled={geoLocating}
                className={cx(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-field)] border border-border px-3 text-[15px] font-medium hover:bg-surface-2 transition-colors",
                  filters.lat && "border-primary text-primary font-semibold bg-primary-soft/50",
                )}
              >
                <Navigation aria-hidden className={cx("size-4", geoLocating && "animate-spin")} />
                {geoLocating ? d.locating : d.nearMe}
              </button>

              {hasActiveFilters ? (
                <Link
                  to={pathFor("businessDirectory", site.lang)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-field)] px-3 text-[14px] text-muted hover:text-text hover:bg-surface-2 transition-colors"
                >
                  <X aria-hidden className="size-4" />
                  {d.clearFilters}
                </Link>
              ) : null}
            </div>

            {geoError ? <p className="text-sm text-danger">{geoError}</p> : null}
          </div>
        </Form>
      </Card>

      {/* Resultados */}
      <section aria-label={d.title} className="mt-10">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted">
            {fmt(d.resultsCount, { count: businesses.length })}
          </p>
        </div>

        {businesses.length === 0 ? (
          <Card className="mt-6 flex flex-col items-center justify-center p-12 text-center">
            <Building2 aria-hidden className="size-12 text-muted/60" />
            <h2 className="mt-4 text-lg font-semibold">{d.noResults}</h2>
            <p className="mt-1.5 max-w-md text-sm text-muted">{d.noResultsHint}</p>
          </Card>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {businesses.map((business) => (
              <BusinessCard key={business.businessId} business={business} />
            ))}
          </div>
        )}

        {/* Paginación */}
        {nextCursor ? (
          <div className="mt-10 flex justify-center">
            <LinkButton
              variant="secondary"
              to={{
                search: (() => {
                  const sp = new URLSearchParams(searchParams);
                  sp.set("cursor", nextCursor);
                  return sp.toString();
                })(),
              }}
            >
              {d.loadMore}
            </LinkButton>
          </div>
        ) : null}
      </section>
    </Container>
  );
}

function BusinessCard({ business }: { business: PublicBusinessSummary }) {
  const { site, t } = useRoot();
  const d = t.public.directory;
  const profileHref = pathFor("businessProfile", site.lang, { id: business.businessId });

  const firstBookingTarget = business.bookingTargets?.[0];
  const bookingHref = firstBookingTarget
    ? pathFor("booking", site.lang, { slug: firstBookingTarget.slug })
    : null;

  const loc = business.location;
  const locationText =
    loc.addressVisibility === "locality"
      ? `${loc.locality}, ${loc.country}`
      : `${loc.address}, ${loc.locality}`;

  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      {/* Portada */}
      <div className="relative h-44 w-full bg-surface-2 overflow-hidden">
        {business.cover?.url ? (
          <img
            src={business.cover.url}
            alt={business.cover.alt || business.displayName}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted/50">
            <Building2 aria-hidden className="size-12" />
          </div>
        )}
        {business.distanceKm !== null ? (
          <div className="absolute bottom-2 right-2 rounded-full bg-background/90 backdrop-blur px-2.5 py-1 text-xs font-semibold text-text shadow-sm">
            {fmt(d.distanceKm, { distance: business.distanceKm.toFixed(1) })}
          </div>
        ) : null}
      </div>

      {/* Contenido */}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2">
          <Badge>{categoryLabel(business.primaryCategory, site.lang)}</Badge>
        </div>

        <h2 className="mt-2 text-xl font-semibold tracking-tight text-text hover:text-primary transition-colors">
          <Link to={profileHref}>{business.displayName}</Link>
        </h2>

        {business.summary ? <p className="mt-2 line-clamp-2 text-sm text-muted">{business.summary}</p> : null}

        <div className="mt-4 flex items-center gap-1.5 text-xs text-muted">
          <MapPin aria-hidden className="size-3.5 shrink-0 text-muted/80" />
          <span className="truncate">{locationText}</span>
        </div>

        {/* Acciones */}
        <div className="mt-auto pt-5 flex items-center gap-2">
          <LinkButton to={profileHref} variant="secondary" className="flex-1 text-sm">
            {d.viewProfile}
          </LinkButton>
          {bookingHref ? (
            <LinkButton to={bookingHref} variant="primary" className="flex-1 text-sm">
              <Calendar aria-hidden className="size-4" />
              {d.bookAppointment}
            </LinkButton>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
