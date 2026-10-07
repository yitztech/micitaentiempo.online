import type { Lang } from "@mcet/i18n";
import { type AuthInfo, OAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";
import { createLocalJWKSet, errors, type JSONWebKeySet, type JWTPayload, jwtVerify } from "jose";
import type { Env } from "../config/env.js";
import type { Database } from "../db/db.module.js";
import { jwks } from "../db/schema.js";
import { mcpIssuer, mcpResource, mcpResourceMetadataUrl } from "./mcp.config.js";

const JWKS_TTL_MS = 60_000;

/**
 * Verifica los access tokens de MCP contra el JWKS de Better Auth leído de la base de datos (sin
 * salir a la red): firma, emisor del dominio, audiencia = recurso /mcp del dominio y caducidad.
 */
export class McpTokenVerifier {
  private cache: { set: ReturnType<typeof createLocalJWKSet>; kids: Set<string>; at: number } | undefined;

  constructor(
    private readonly db: Database,
    private readonly env: Env,
  ) {}

  private async keys(kid: string | undefined) {
    const fresh = this.cache && Date.now() - this.cache.at < JWKS_TTL_MS;
    if (fresh && this.cache && (!kid || this.cache.kids.has(kid))) return this.cache.set;
    const rows = await this.db.select().from(jwks);
    const set: JSONWebKeySet = {
      keys: rows.map((r) => ({ ...JSON.parse(r.publicKey), kid: r.id, ...(r.alg ? { alg: r.alg } : {}) })),
    };
    this.cache = { set: createLocalJWKSet(set), kids: new Set(rows.map((r) => r.id)), at: Date.now() };
    return this.cache.set;
  }

  async verify(token: string, lang: Lang): Promise<AuthInfo> {
    const resource = mcpResource(this.env, lang);
    let payload: JWTPayload;
    try {
      const header = JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8")) as {
        kid?: string;
      };
      ({ payload } = await jwtVerify(token, await this.keys(header.kid), {
        issuer: mcpIssuer(this.env, lang),
        audience: resource,
      }));
    } catch (err) {
      const expired = err instanceof errors.JWTExpired;
      throw new OAuthError(OAuthErrorCode.InvalidToken, expired ? "Token has expired" : "Invalid token");
    }
    const clientId = (payload.azp ?? payload.client_id) as string | undefined;
    if (!payload.sub || !clientId || typeof payload.exp !== "number") {
      throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid token");
    }
    const scope = typeof payload.scope === "string" ? payload.scope : "";
    return {
      token,
      clientId,
      scopes: scope.split(" ").filter(Boolean),
      expiresAt: payload.exp,
      resource: new URL(resource),
      resourceMetadataUrl: mcpResourceMetadataUrl(this.env, lang),
      extra: { userId: payload.sub, lang },
    };
  }
}
