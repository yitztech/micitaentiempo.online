import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import * as schemas from "../dist/index.js";

const exportedSchemas = {
  UpdateBusinessProfile: schemas.UpdateBusinessProfile,
  ChangeBusinessPublication: schemas.ChangeBusinessPublication,
  CreateBusinessLocation: schemas.CreateBusinessLocation,
  AssignBusinessCalendar: schemas.AssignBusinessCalendar,
  UpdateBusinessImages: schemas.UpdateBusinessImages,
  PrivateBusinessProfile: schemas.PrivateBusinessProfile,
  PublicBusinessProfile: schemas.PublicBusinessProfile,
  BusinessDirectoryPage: schemas.BusinessDirectoryPage,
  BusinessDirectoryQuery: schemas.BusinessDirectoryQuery,
  BusinessPageQuery: schemas.BusinessPageQuery,
  BusinessLocalitiesQuery: schemas.BusinessLocalitiesQuery,
  BusinessAccountCapabilities: schemas.BusinessAccountCapabilities,
  BusinessCalendarProjectionEvent: schemas.BusinessCalendarProjectionEvent,
  OfflineOperationMetadata: schemas.OfflineOperationMetadata,
  OfflineChangesQuery: schemas.OfflineChangesQuery,
};
const components = Object.fromEntries(
  Object.entries(exportedSchemas).map(([name, schema]) => [
    name,
    z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" }),
  ]),
);
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
components.Problem = {
  type: "object",
  required: ["type", "title", "status", "code", "requestId"],
  properties: {
    type: { type: "string", format: "uri-reference" },
    title: { type: "string", maxLength: 255 },
    status: { type: "integer", minimum: 400, maximum: 599 },
    code: { type: "string", maxLength: 100 },
    detail: { type: "string", maxLength: 2000 },
    requestId: { type: "string", maxLength: 128 },
    errors: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        required: ["field", "code", "message"],
        additionalProperties: false,
        properties: {
          field: { type: "string", maxLength: 255 },
          code: { type: "string", maxLength: 100 },
          message: { type: "string", maxLength: 2000 },
        },
      },
    },
  },
  additionalProperties: false,
};
const paths = {};
const add = (
  path,
  method,
  {
    body,
    query,
    output,
    status = 200,
    publicAccess = false,
    idempotent = false,
    multipart = false,
    binary = false,
    description,
  },
) => {
  const parameters = [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
    name,
    in: "path",
    required: true,
    schema:
      name === "variant"
        ? { type: "string", enum: ["thumbnail", "display"] }
        : { type: "string", format: "uuid" },
  }));
  if (query) {
    const querySchema = components[query];
    for (const [name, schema] of Object.entries(querySchema.properties)) {
      parameters.push({ name, in: "query", required: querySchema.required?.includes(name) ?? false, schema });
    }
  }
  if (idempotent)
    parameters.push({
      name: "Idempotency-Key",
      in: "header",
      required: true,
      schema: { type: "string", format: "uuid" },
    });
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 413, 422, 429, 503].map((code) => [
      code,
      {
        description:
          "Problem Details; translated using the request domain/prefix or X-App-Locale for native clients.",
        content: { "application/problem+json": { schema: ref("Problem") } },
        ...(code === 429
          ? {
              headers: {
                "Retry-After": {
                  schema: { type: "integer", minimum: 1 },
                  description: "Seconds before retry.",
                },
              },
            }
          : {}),
      },
    ]),
  );
  const success = {
    description: status === 204 ? "Removed" : "Success",
    ...(output ? { content: { "application/json": { schema: ref(output) } } } : {}),
  };
  if (status === 201)
    success.headers = {
      Location: { description: "Created resource URI", schema: { type: "string", format: "uri-reference" } },
    };
  if (binary) success.content = { "image/webp": { schema: { type: "string", format: "binary" } } };
  paths[path] ??= {};
  paths[path][method] = {
    operationId: `${method}_${path.replace(/[^a-zA-Z0-9]+/g, "_")}`,
    description,
    security: publicAccess ? [] : [{ cookieSession: [] }, { mobileBearer: [] }],
    parameters,
    ...(body
      ? { requestBody: { required: true, content: { "application/json": { schema: ref(body) } } } }
      : {}),
    ...(multipart
      ? {
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["file", "expectedVersion", "alt"],
                  properties: {
                    file: { type: "string", format: "binary" },
                    expectedVersion: { type: "integer", minimum: 1 },
                    alt: { type: "string", minLength: 1, maxLength: schemas.BUSINESS_LIMITS.alt },
                  },
                },
              },
            },
          },
        }
      : {}),
    responses: { [status]: success, ...errors },
    "x-implementation-status": "planned",
  };
};
const privatePath = "/api/business-profile";
add(privatePath, "get", { output: "PrivateBusinessProfile", description: "Owner only. No shared cache." });
add(privatePath, "patch", {
  body: "UpdateBusinessProfile",
  output: "PrivateBusinessProfile",
  idempotent: true,
  description:
    "Complete editable content with expectedVersion. Unicode code-point limits after trim. Duplicate categories/platforms and unsafe URLs rejected by Zod. 409 preserves client draft.",
});
for (const action of ["publish", "unpublish"])
  add(`${privatePath}/${action}`, "post", {
    body: "ChangeBusinessPublication",
    output: "PrivateBusinessProfile",
    idempotent: true,
    description: "Owner only, online explicit action. Validate canonical organization and calendar state.",
  });
components.BusinessLocation = z.toJSONSchema(schemas.BusinessLocationContent, { io: "input" });
components.PrivateLocation = {
  type: "object",
  required: ["id", "version", "location"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    version: { type: "integer", minimum: 1 },
    location: ref("BusinessLocation"),
  },
};
components.LocationPage = {
  type: "object",
  required: ["items", "nextCursor"],
  additionalProperties: false,
  properties: {
    items: { type: "array", maxItems: schemas.BUSINESS_LIMITS.locations, items: ref("PrivateLocation") },
    nextCursor: { type: ["string", "null"], maxLength: schemas.BUSINESS_LIMITS.cursor },
  },
};
add(`${privatePath}/locations`, "get", {
  query: "BusinessPageQuery",
  output: "LocationPage",
  description: "Owner only; paginated.",
});
add(`${privatePath}/locations`, "post", {
  body: "CreateBusinessLocation",
  output: "PrivateLocation",
  status: 201,
  idempotent: true,
  description:
    "Latitude/longitude both present or null; parent profile version and transactional quota checked.",
});
add(`${privatePath}/locations/{id}`, "patch", {
  body: "CreateBusinessLocation",
  output: "PrivateLocation",
  idempotent: true,
  description: "Owner only; expectedVersion is parent profile revision.",
});
add(`${privatePath}/locations/{id}`, "delete", {
  body: "ChangeBusinessPublication",
  status: 204,
  idempotent: true,
  description: "Owner only; reject if calendars remain attached.",
});
add(`${privatePath}/calendar-locations/{calendarId}`, "put", {
  body: "AssignBusinessCalendar",
  output: "PrivateBusinessProfile",
  idempotent: true,
  description: "Owner only; location/calendar must belong to organization. Null detaches.",
});
add(`${privatePath}/images`, "post", {
  multipart: true,
  status: 201,
  idempotent: true,
  description:
    "Owner only. Max file 5 MiB, 25 MP; JPEG/PNG/WebP detected by content; strip EXIF. CSRF remains required.",
});
add(`${privatePath}/images`, "patch", {
  body: "UpdateBusinessImages",
  output: "PrivateBusinessProfile",
  idempotent: true,
  description: "Complete image order; unique owned IDs, at most one cover.",
});
add(`${privatePath}/images/{id}`, "delete", {
  body: "ChangeBusinessPublication",
  status: 204,
  idempotent: true,
  description: "Owner only; immediate logical removal, recoverable file cleanup.",
});
add(`${privatePath}/images/{imageId}/{variant}`, "get", {
  binary: true,
  description: "Owner preview; private, no-store. Never expose original uploads.",
});
for (const name of ["Category", "Locality"]) {
  const properties =
    name === "Category"
      ? { code: z.toJSONSchema(schemas.BusinessCategory), label: { type: "string", maxLength: 150 } }
      : {
          country: { type: "string", pattern: "^[A-Z]{2}$" },
          region: { type: "string", maxLength: 200 },
          locality: { type: "string", maxLength: 200 },
        };
  components[`${name}Page`] = {
    type: "object",
    required: ["items", "nextCursor"],
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        maxItems: 100,
        items: { type: "object", additionalProperties: false, required: Object.keys(properties), properties },
      },
      nextCursor: { type: ["string", "null"], maxLength: 2048 },
    },
  };
}
add("/api/public/v1/business-categories", "get", {
  query: "BusinessPageQuery",
  output: "CategoryPage",
  publicAccess: true,
  description: "Active categories in request locale.",
});
add("/api/public/v1/business-localities", "get", {
  query: "BusinessLocalitiesQuery",
  output: "LocalityPage",
  publicAccess: true,
  description: "Published localities only; country required to disambiguate.",
});
add("/api/public/v1/businesses", "get", {
  query: "BusinessDirectoryQuery",
  output: "BusinessDirectoryPage",
  publicAccess: true,
  description:
    "Either country/locality OR lat/lng; never both. Coordinates required for distance/radius. Default radius 10km. Cursor bound to normalized filters/order; mismatch 422. Coordinates excluded from access logs/shared cache.",
});
add("/api/public/v1/businesses/{businessId}", "get", {
  output: "PublicBusinessProfile",
  publicAccess: true,
  description:
    "Published and not suspended/deleted. Locality-only locations omit private street and coordinates. Services paginated; initial page at most 100. Canonical state checked before response.",
});
add("/api/public/v1/businesses/{businessId}/images/{imageId}/{variant}", "get", {
  binary: true,
  publicAccess: true,
  description: "Check canonical publication for every read; 404 after withdrawal. No shared stale cache.",
});
const document = {
  openapi: "3.1.0",
  info: {
    title: "Mi Cita en Tiempo — business directory contracts",
    version: "0.1.0",
    description:
      "DESIGN CONTRACT ONLY: endpoints are not implemented by C0. Existing endpoints are intentionally outside this document. Generated from shared Zod; semantic refinements remain executable Zod checks. See ADR 0019 for offline protocol and security.",
  },
  paths,
  components: {
    schemas: components,
    securitySchemes: {
      cookieSession: { type: "apiKey", in: "cookie", name: "__Secure-mcet.session_token" },
      mobileBearer: { type: "http", scheme: "bearer" },
    },
  },
};
const output = `${JSON.stringify(document, null, 2)}\n`;
const path = fileURLToPath(new URL("../../../openapi.yaml", import.meta.url));
if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8") !== output)
    throw new Error("openapi.yaml is stale; run pnpm --filter @mcet/schemas openapi after building packages");
} else writeFileSync(path, output);
