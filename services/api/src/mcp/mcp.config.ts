import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import type { Lang } from "@mcet/i18n";
import type { Env } from "../config/env.js";

/** Permisos que puede pedir una aplicación de IA (docs/plan/06-mcp.md §6.3). */
export const MCP_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "calendar:read",
  "calendar:write",
  "customers:read",
  "stats:read",
  "settings:write",
  "billing:read",
  "notifications:read",
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

/**
 * Permisos con que se registra un cliente que no dice cuáles quiere: todos. El usuario decide en el
 * consentimiento; `offline_access` va incluido para que reciba refresh token (Claude refresca).
 */
export const MCP_DEFAULT_SCOPES = MCP_SCOPES;

/** Recurso protegido (RFC 8707/9728) de cada dominio: los tokens llevan esta audiencia. */
export function mcpResource(env: Env, lang: Lang): string {
  return `${env.site.siteUrl[lang]}/mcp`;
}

/** Emisor del servidor de autorización de cada dominio (baseURL + basePath de Better Auth). */
export function mcpIssuer(env: Env, lang: Lang): string {
  return `${env.site.siteUrl[lang]}/api/auth`;
}

/** URL del documento RFC 9728 del recurso /mcp. */
export function mcpResourceMetadataUrl(env: Env, lang: Lang): string {
  return `${env.site.siteUrl[lang]}/.well-known/oauth-protected-resource/mcp`;
}

/** Dominio reservado (RFC 2606) cuyos documentos CIMD sirve el entorno de pruebas. */
const TEST_CIMD_SUFFIX = ".example";

/**
 * Descarga de documentos CIMD con protección SSRF (resuelve una vez, solo IPs públicas, sin
 * redirecciones). Con TEST_MODE y CIMD_FAKE_URL, los `client_id` de dominios `.example` se leen del
 * servidor de captura, que imita a la aplicación de IA.
 */
export function cimdFetch(env: Env): ClientMetadataResourceFetch {
  const fake = env.TEST_MODE ? env.CIMD_FAKE_URL : undefined;
  if (!fake) return fetchClientMetadataResource;
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!url.hostname.endsWith(TEST_CIMD_SUFFIX)) return fetchClientMetadataResource(input, init);
    return fetch(`${fake}/__cimd/${url.hostname}${url.pathname}`, { ...init, redirect: "manual" });
  };
}
