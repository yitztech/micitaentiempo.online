import { describe, expect, it } from "vitest";
import {
  AssignBusinessCalendar,
  BUSINESS_LIMITS,
  BusinessCalendarProjectionEvent,
  BusinessDirectoryQuery,
  BusinessImage,
  BusinessLocationContent,
  BusinessProfileContent,
  BusinessResourceUrl,
  BusinessSocialLink,
  BusinessUrl,
  OFFLINE_LIMITS,
  OfflineOperationMetadata,
  PublicBusinessLocation,
  UpdateBusinessImages,
  UpdateBusinessProfile,
} from "../../packages/schemas/dist/index.js";

const id = "019a0000-0000-7000-8000-000000000001";
const profile = {
  displayName: "Clínica 24",
  description: "",
  primaryCategory: null,
  secondaryCategories: [],
  websiteUrl: null,
  termsUrl: null,
  socialLinks: [],
};
const location = {
  name: "Centro",
  country: "MX",
  region: "Morelos",
  locality: "Cuernavaca",
  address: "",
  postalCode: "",
  addressVisibility: "locality",
  latitude: null,
  longitude: null,
};

describe("contratos de negocios", () => {
  it("admite borrador incompleto y exige versión y lista blanca al guardar", () => {
    expect(BusinessProfileContent.parse(profile)).toEqual(profile);
    expect(UpdateBusinessProfile.safeParse(profile).success).toBe(false);
    expect(UpdateBusinessProfile.safeParse({ ...profile, expectedVersion: 1 }).success).toBe(true);
    for (const extra of [{ orgId: id }, { ownerUserId: id }, { status: "published" }]) {
      expect(UpdateBusinessProfile.safeParse({ ...profile, expectedVersion: 1, ...extra }).success).toBe(
        false,
      );
    }
  });
  it("cuenta puntos de código después de trim sin recortar ni normalizar el nombre", () => {
    const name = "𐐀".repeat(BUSINESS_LIMITS.displayName);
    expect(BusinessProfileContent.parse({ ...profile, displayName: ` ${name} ` }).displayName).toBe(name);
    expect(BusinessProfileContent.safeParse({ ...profile, displayName: `${name}a` }).success).toBe(false);
    expect(BusinessProfileContent.parse({ ...profile, displayName: "Café  24" }).displayName).toBe(
      "Café  24",
    );
    expect(BusinessProfileContent.safeParse({ ...profile, displayName: "a\nB" }).success).toBe(false);
  });
  it("rechaza categorías repetidas y plataformas duplicadas", () => {
    expect(
      BusinessProfileContent.safeParse({
        ...profile,
        primaryCategory: "health",
        secondaryCategories: ["health"],
      }).success,
    ).toBe(false);
    expect(
      BusinessProfileContent.safeParse({ ...profile, secondaryCategories: ["health", "health"] }).success,
    ).toBe(false);
    const link = { platform: "instagram", url: "https://instagram.com/clinica" };
    expect(BusinessProfileContent.safeParse({ ...profile, socialLinks: [link, link] }).success).toBe(false);
  });
  it.each([
    "javascript:alert(1)",
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com:444/path",
  ])("rechaza URL insegura %s", (url) => {
    expect(BusinessUrl.safeParse(url).success).toBe(false);
  });
  it("valida el host completo de la red social sin aceptar sufijos ni credenciales", () => {
    expect(
      BusinessSocialLink.safeParse({ platform: "instagram", url: "https://instagram.com/clinic" }).success,
    ).toBe(true);
    for (const url of [
      "https://instagram.com.evil.test/",
      "https://instagram.com@evil.test/",
      "https://evil.test/instagram.com",
    ]) {
      expect(BusinessSocialLink.safeParse({ platform: "instagram", url }).success).toBe(false);
    }
  });
  it("exige coordenadas emparejadas, finitas y en rango", () => {
    expect(BusinessLocationContent.safeParse(location).success).toBe(true);
    for (const coords of [
      { latitude: 0 },
      { latitude: NaN, longitude: 0 },
      { latitude: 91, longitude: 0 },
      { latitude: 0, longitude: Infinity },
    ]) {
      expect(BusinessLocationContent.safeParse({ ...location, ...coords }).success).toBe(false);
    }
    expect(BusinessLocationContent.safeParse({ ...location, latitude: 0, longitude: 0 }).success).toBe(true);
  });
  it("permite desvincular calendarios y rechaza IDs arbitrarios", () => {
    expect(AssignBusinessCalendar.safeParse({ expectedVersion: 1, locationId: null }).success).toBe(true);
    expect(AssignBusinessCalendar.safeParse({ expectedVersion: 1, locationId: "other" }).success).toBe(false);
  });
  it("impide imágenes repetidas y varias portadas", () => {
    const image = { id, alt: "Fachada", cover: true };
    expect(UpdateBusinessImages.safeParse({ expectedVersion: 1, images: [image, image] }).success).toBe(
      false,
    );
    expect(
      UpdateBusinessImages.safeParse({
        expectedVersion: 1,
        images: [image, { ...image, id: "019a0000-0000-7000-8000-000000000002" }],
      }).success,
    ).toBe(false);
  });
  it("separa búsqueda manual y por radio y acota paginación", () => {
    expect(BusinessDirectoryQuery.parse({ country: "MX", locality: "Cuernavaca" }).limit).toBe(20);
    expect(BusinessDirectoryQuery.parse({ lat: "0", lng: "0", sort: "distance" }).radiusKm).toBe(10);
    for (const q of [
      {},
      { lat: "0" },
      { lat: "91", lng: "0" },
      { country: "MX", locality: "C", sort: "distance" },
      { lat: "0", lng: "0", locality: "C" },
      { lat: "0", lng: "0", radiusKm: "101" },
      { country: "MX", locality: "C", limit: "101" },
    ]) {
      expect(BusinessDirectoryQuery.safeParse(q).success).toBe(false);
    }
  });
  it("proyección requiere versión de agregado y no lleva datos de clientes", () => {
    const event = {
      eventId: id,
      schemaVersion: 1,
      aggregateVersion: 2,
      occurredAt: "2026-10-27T12:00:00Z",
      businessId: id,
      calendarId: id,
      state: "deleted",
      slug: "clinica",
      hasActiveServices: false,
    };
    expect(BusinessCalendarProjectionEvent.safeParse(event).success).toBe(true);
    expect(BusinessCalendarProjectionEvent.safeParse({ ...event, attendee: "private" }).success).toBe(false);
    expect(BusinessCalendarProjectionEvent.safeParse({ ...event, aggregateVersion: 0 }).success).toBe(false);
  });
});

describe("privacidad del DTO público", () => {
  it("admite rutas generadas en desarrollo sin permitir destinos relativos ambiguos", () => {
    expect(BusinessResourceUrl.safeParse("/negocios/abc").success).toBe(true);
    expect(
      BusinessImage.safeParse({ id, alt: "Fachada", cover: true, url: "/api/public/v1/businesses/image" })
        .success,
    ).toBe(true);
    for (const url of ["//evil.test", "/\\evil.test", "javascript:alert(1)"]) {
      expect(BusinessResourceUrl.safeParse(url).success).toBe(false);
    }
  });

  it("rechaza calle y coordenadas incluso si son nulas en modo localidad", () => {
    const visible = {
      id,
      name: "Centro",
      country: "MX",
      region: "Morelos",
      locality: "Cuernavaca",
      addressVisibility: "locality",
    };
    expect(PublicBusinessLocation.safeParse(visible).success).toBe(true);
    for (const extra of [
      { address: "Calle privada" },
      { latitude: null },
      { longitude: -99 },
      { ownerUserId: id },
    ]) {
      expect(PublicBusinessLocation.safeParse({ ...visible, ...extra }).success).toBe(false);
    }
  });
  it("no interpreta coordenadas vacías ni booleanas como cero", () => {
    for (const lat of ["", " ", null, false]) {
      expect(BusinessDirectoryQuery.safeParse({ lat, lng: "0" }).success).toBe(false);
    }
  });
});

describe("metadatos durables offline", () => {
  const op = {
    operationId: id,
    accountId: "user-1",
    businessId: null,
    environment: "test",
    resourceId: id,
    kind: "booking.request",
    baseVersion: null,
    dependsOn: [],
    createdAt: "2026-10-27T12:00:00Z",
    expiresAt: "2026-10-28T12:00:00Z",
    state: "pending",
  };
  it("admite intención pendiente y excluye operaciones sensibles de la cola", () => {
    expect(OfflineOperationMetadata.safeParse(op).success).toBe(true);
    for (const kind of ["profile.publish", "account.delete", "payment", "login"]) {
      expect(OfflineOperationMetadata.safeParse({ ...op, kind }).success).toBe(false);
    }
  });
  it("acota vigencia y dependencias sin confundir pendiente con confirmado", () => {
    expect(OFFLINE_LIMITS.sendWithinHours).toBe(24);
    for (const change of [
      { dependsOn: [id] },
      { expiresAt: op.createdAt },
      { expiresAt: "2026-10-29T12:00:00Z" },
      { state: "confirmed" },
      { password: "secret" },
    ]) {
      expect(OfflineOperationMetadata.safeParse({ ...op, ...change }).success).toBe(false);
    }
  });
});
