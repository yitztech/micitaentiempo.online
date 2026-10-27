import { categoryLabel, pathFor } from "@mcet/i18n";
import type {
  BusinessCategory,
  BusinessSocialPlatform,
  CategoryPage,
  LocationPage,
  PrivateBusinessProfile,
} from "@mcet/schemas";
import { CheckCircle2, ExternalLink, Eye, MapPin, Plus, Trash2, Upload } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useRevalidator } from "react-router";
import { Select } from "~/components/select";
import { Alert, Badge, Button, Card, Container, Field, LinkButton, TextArea } from "~/components/ui";
import { apiGet } from "~/lib/api.server";
import { type ApiError, apiRequest, errorText } from "~/lib/api-client";
import { useRoot } from "~/lib/i18n";
import { panelGet } from "~/lib/panel.server";
import type { BoardView } from "~/lib/panel-types";
import { metaFor, publicCacheHeaders } from "~/lib/seo";
import type { Route } from "./+types/business-profile-settings";

export async function loader({ request, context }: Route.LoaderArgs) {
  const [profile, locationsPage, calendars, categoriesRes] = await Promise.all([
    panelGet<PrivateBusinessProfile>(request, context, "/api/business-profile"),
    panelGet<LocationPage>(request, context, "/api/business-profile/locations?limit=50"),
    panelGet<BoardView[]>(request, context, "/api/v1/calendars"),
    apiGet<CategoryPage>(request, "/api/public/v1/business-categories?limit=50"),
  ]);

  return {
    profile,
    locations: locationsPage.items,
    calendars,
    categories: categoriesRes.body?.items ?? [],
  };
}

export const meta = (args: Route.MetaArgs) =>
  metaFor(args, (t) => ({
    title: t.panel.businessProfile.seoTitle,
    indexable: false,
  }));

export const headers = () => publicCacheHeaders;

export default function BusinessProfileSettingsPage({ loaderData }: Route.ComponentProps) {
  const { profile, locations, calendars, categories } = loaderData;
  const { site, t } = useRoot();
  const bp = t.panel.businessProfile;
  const revalidator = useRevalidator();

  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [addingLocation, setAddingLocation] = useState(false);

  // Social links state
  const [socialLinks, _setSocialLinks] = useState<Array<{ platform: BusinessSocialPlatform; url: string }>>(
    profile.content.socialLinks ?? [],
  );

  async function runAction(key: string, fn: () => Promise<unknown>, okMsg?: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      if (okMsg) setMsg({ ok: true, text: okMsg });
      void revalidator.revalidate();
    } catch (err) {
      setMsg({ ok: false, text: errorText(t.panel.errors, err) });
    } finally {
      setBusy(null);
    }
  }

  // Guardar datos básicos
  function onSaveBasic(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const displayName = String(f.get("displayName") ?? "").trim();
    const description = String(f.get("description") ?? "").trim();
    const primaryCategory = String(f.get("primaryCategory") ?? "") as BusinessCategory;
    const websiteUrl = String(f.get("websiteUrl") ?? "").trim() || null;
    const termsUrl = String(f.get("termsUrl") ?? "").trim() || null;

    void runAction(
      "save-basic",
      () =>
        apiRequest(
          "PATCH",
          "/api/business-profile",
          {
            expectedVersion: profile.version,
            displayName,
            description,
            primaryCategory,
            secondaryCategories: profile.content.secondaryCategories,
            websiteUrl,
            termsUrl,
            socialLinks,
          },
          { "Idempotency-Key": crypto.randomUUID() },
        ),
      bp.savedSuccess,
    );
  }

  // Publicar o retirar del directorio
  function onTogglePublish() {
    const isPublishing = profile.status === "draft";
    const endpoint = isPublishing ? "/api/business-profile/publish" : "/api/business-profile/unpublish";
    const successMsg = isPublishing ? bp.publishedSuccess : bp.unpublishedSuccess;

    void runAction(
      "toggle-publish",
      () =>
        apiRequest(
          "POST",
          endpoint,
          { expectedVersion: profile.version },
          { "Idempotency-Key": crypto.randomUUID() },
        ),
      successMsg,
    );
  }

  // Añadir sede
  function onAddLocation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    const address = String(f.get("address") ?? "").trim();
    const locality = String(f.get("locality") ?? "").trim();
    const region = String(f.get("region") ?? "").trim();
    const postalCode = String(f.get("postalCode") ?? "").trim();
    const country = String(f.get("country") ?? "")
      .trim()
      .toUpperCase();
    const addressVisibility = f.get("addressVisibility") === "locality" ? "locality" : "public";

    void runAction(
      "add-location",
      async () => {
        await apiRequest(
          "POST",
          "/api/business-profile/locations",
          {
            expectedVersion: profile.version,
            location: {
              name,
              address,
              locality,
              region,
              postalCode,
              country,
              addressVisibility,
              latitude: null,
              longitude: null,
            },
          },
          { "Idempotency-Key": crypto.randomUUID() },
        );
        setAddingLocation(false);
      },
      bp.locations.saveLocation,
    );
  }

  // Eliminar sede
  function onDeleteLocation(locationId: string) {
    if (!window.confirm(bp.locations.confirmDelete)) return;
    void runAction("delete-location", () =>
      apiRequest(
        "DELETE",
        `/api/business-profile/locations/${locationId}`,
        { expectedVersion: profile.version },
        { "Idempotency-Key": crypto.randomUUID() },
      ),
    );
  }

  // Asignar sede a calendario
  function onAssignCalendar(calendarId: string, locationId: string | null) {
    void runAction(`assign-${calendarId}`, () =>
      apiRequest(
        "PUT",
        `/api/business-profile/calendar-locations/${calendarId}`,
        { expectedVersion: profile.version, locationId },
        { "Idempotency-Key": crypto.randomUUID() },
      ),
    );
  }

  // Subir imagen
  async function onUploadImage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = f.get("file") as File | null;
    if (!file || file.size === 0) return;

    setBusy("upload-image");
    setMsg(null);
    try {
      const data = new FormData();
      data.set("file", file);
      data.set("expectedVersion", String(profile.version));
      data.set("alt", String(f.get("alt") ?? "").trim());

      const res = await fetch("/api/business-profile/images", {
        method: "POST",
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: data,
        credentials: "same-origin",
      });

      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        throw { status: res.status, code: String(errJson.code ?? "upload_failed") } satisfies ApiError;
      }

      setMsg({ ok: true, text: bp.savedSuccess });
      void revalidator.revalidate();
    } catch (err) {
      setMsg({ ok: false, text: errorText(t.panel.errors, err) });
    } finally {
      setBusy(null);
    }
  }

  // Mapear requisitos faltantes
  const reqMap: Record<string, string> = {
    display_name: bp.reqDisplayName,
    description: bp.reqDescription,
    primary_category: bp.reqPrimaryCategory,
    location: bp.reqLocation,
    active_calendar: bp.reqCalendar,
    active_service: bp.reqCalendar,
  };

  const isPublished = profile.status === "published";
  const canPublish = profile.requirements.length === 0;

  return (
    <Container className="py-8 sm:py-12">
      {/* Encabezado */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text">{bp.title}</h1>
            <Badge
              className={
                isPublished
                  ? "bg-success-soft text-success border border-success/30"
                  : "bg-surface-2 text-muted"
              }
            >
              {isPublished ? bp.status.published : bp.status.draft}
            </Badge>
          </div>
          <p className="mt-1.5 text-sm text-muted">{bp.lead}</p>
        </div>

        <div className="flex items-center gap-3">
          <LinkButton
            to={pathFor("businessProfile", site.lang, { id: profile.businessId })}
            variant="secondary"
            className="text-sm"
            target="_blank"
          >
            <Eye aria-hidden className="size-4" />
            Vista previa
            <ExternalLink aria-hidden className="size-3" />
          </LinkButton>

          <Button
            type="button"
            variant={isPublished ? "danger" : "primary"}
            loading={busy === "toggle-publish"}
            disabled={!isPublished && !canPublish}
            onClick={onTogglePublish}
            className="text-sm"
          >
            {isPublished ? bp.unpublishAction : bp.publishAction}
          </Button>
        </div>
      </div>

      {/* Alerta de resultado */}
      {msg ? (
        <div className="mt-6">
          <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert>
        </div>
      ) : null}

      {/* Requisitos para publicar */}
      {!isPublished ? (
        <Card className="mt-6 p-5">
          <h2 className="text-base font-semibold text-text">{bp.requirementsTitle}</h2>
          {profile.requirements.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-sm text-warning font-medium">{bp.missingRequirements}</p>
              <ul className="list-disc pl-5 text-sm text-muted space-y-1">
                {profile.requirements.map((req) => (
                  <li key={req}>{reqMap[req] ?? req}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 flex items-center gap-2 text-sm text-success font-medium">
              <CheckCircle2 aria-hidden className="size-4" />
              {bp.allRequirementsMet}
            </p>
          )}
        </Card>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Columna Izquierda: Información básica */}
        <div className="flex flex-col gap-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold tracking-tight text-text">Información general</h2>
            <form onSubmit={onSaveBasic} className="mt-5 flex flex-col gap-4">
              <Field
                label={bp.fields.displayName}
                name="displayName"
                defaultValue={profile.content.displayName}
                required
                maxLength={100}
                hint={bp.fields.displayNameHelp}
              />

              <TextArea
                label={bp.fields.description}
                name="description"
                defaultValue={profile.content.description}
                required
                maxLength={4000}
                hint={bp.fields.descriptionHelp}
              />

              <Select
                label={bp.fields.primaryCategory}
                name="primaryCategory"
                defaultValue={profile.content.primaryCategory ?? ""}
                required
              >
                <option value="">{bp.fields.selectCategory}</option>
                {categories.map((c) => (
                  <option key={c.code} value={c.code}>
                    {categoryLabel(c.code, site.lang)}
                  </option>
                ))}
              </Select>

              <Field
                label={bp.fields.websiteUrl}
                name="websiteUrl"
                type="url"
                defaultValue={profile.content.websiteUrl ?? ""}
                placeholder="https://tu-negocio.com"
                maxLength={2048}
                optional
              />

              <Field
                label={bp.fields.termsUrl}
                name="termsUrl"
                type="url"
                defaultValue={profile.content.termsUrl ?? ""}
                placeholder="https://tu-negocio.com/condiciones"
                maxLength={2048}
                optional
              />

              <div className="pt-2">
                <Button type="submit" variant="primary" loading={busy === "save-basic"}>
                  {bp.fields.save}
                </Button>
              </div>
            </form>
          </Card>

          {/* Asignación de tableros a sedes */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold tracking-tight text-text">{bp.calendars.title}</h2>
            <p className="mt-1 text-sm text-muted">{bp.calendars.lead}</p>

            <div className="mt-4 flex flex-col divide-y divide-border/60">
              {calendars.map((cal) => (
                <div
                  key={cal.id}
                  className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-sm text-text">{cal.name}</p>
                    <p className="text-xs text-muted">/c/{cal.slug}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="min-h-9 rounded-[var(--radius-field)] border border-border-field bg-surface px-2.5 text-xs text-text"
                      defaultValue=""
                      onChange={(e) => {
                        const val = e.target.value || null;
                        onAssignCalendar(cal.id, val);
                      }}
                    >
                      <option value="">{bp.calendars.noLocation}</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.location.name} ({loc.location.locality})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Columna Derecha: Sedes e Imágenes */}
        <div className="flex flex-col gap-6">
          {/* Sedes */}
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-text">{bp.locations.title}</h2>
                <p className="text-sm text-muted">{bp.locations.lead}</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setAddingLocation((v) => !v)}
                className="text-xs"
              >
                <Plus aria-hidden className="size-4" />
                {bp.locations.add}
              </Button>
            </div>

            {/* Formulario para añadir sede */}
            {addingLocation ? (
              <form
                onSubmit={onAddLocation}
                className="mt-5 rounded-lg border border-border p-4 flex flex-col gap-3 bg-surface-2/40"
              >
                <Field label={bp.locations.name} name="name" required maxLength={100} />
                <Field label={bp.locations.addressLine1} name="address" required maxLength={200} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label={bp.locations.locality} name="locality" required maxLength={100} />
                  <Field label={bp.locations.region} name="region" maxLength={100} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={bp.locations.postalCode} name="postalCode" required maxLength={10} />
                  <Field
                    label={bp.locations.country}
                    name="country"
                    required
                    maxLength={2}
                    placeholder="MX"
                  />
                </div>

                <div className="mt-2">
                  <label htmlFor="loc-address-visibility" className="block text-sm font-medium mb-1">
                    {bp.locations.addressVisibility}
                  </label>
                  <select
                    id="loc-address-visibility"
                    name="addressVisibility"
                    defaultValue="public"
                    className="block min-h-10 w-full rounded-[var(--radius-field)] border border-border-field bg-surface px-3 text-sm text-text"
                  >
                    <option value="public">{bp.locations.visibilityFull}</option>
                    <option value="locality">{bp.locations.visibilityLocality}</option>
                  </select>
                </div>

                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setAddingLocation(false)}
                    className="text-sm"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={busy === "add-location"}
                    className="text-sm"
                  >
                    {bp.locations.saveLocation}
                  </Button>
                </div>
              </form>
            ) : null}

            {/* Listado de sedes existentes */}
            <div className="mt-4 flex flex-col divide-y divide-border/60">
              {locations.length === 0 ? (
                <p className="py-4 text-sm text-muted">Aún no has registrado sedes.</p>
              ) : (
                locations.map((loc) => (
                  <div key={loc.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <MapPin aria-hidden className="size-4 text-primary shrink-0" />
                        <span className="font-semibold text-sm text-text">{loc.location.name}</span>
                        <Badge className="text-xs bg-surface-2 text-muted">
                          {loc.location.addressVisibility === "locality" ? "Solo localidad" : "Completa"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted">
                        {loc.location.address ? `${loc.location.address}, ` : ""}
                        {loc.location.locality}, {loc.location.country}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteLocation(loc.id)}
                      className="p-1.5 text-muted hover:text-danger rounded hover:bg-surface-2 transition-colors"
                      title={bp.locations.deleteLocation}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Galería de imágenes */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold tracking-tight text-text">{bp.images.title}</h2>
            <p className="mt-1 text-sm text-muted">{bp.images.lead}</p>

            <form
              onSubmit={onUploadImage}
              className="mt-4 flex flex-col gap-3 rounded-lg border border-dashed border-border p-4 bg-surface-2/30"
            >
              <div className="flex flex-col gap-2">
                <input
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-[var(--radius-field)] file:border-0 file:text-sm file:font-semibold file:bg-primary-soft file:text-primary hover:file:bg-primary/20"
                />
                <Field
                  label={bp.images.altText}
                  name="alt"
                  placeholder="Descripción de la foto para accesibilidad"
                  maxLength={120}
                  optional
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" variant="primary" loading={busy === "upload-image"} className="text-xs">
                  <Upload aria-hidden className="size-4" />
                  {bp.images.upload}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </Container>
  );
}
