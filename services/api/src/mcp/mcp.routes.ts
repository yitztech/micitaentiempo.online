import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pathFor } from "@mcet/i18n";
import {
  bearerAuthChallengeResponse,
  createMcpHandler,
  type McpHttpHandler,
  OAuthError,
  OAuthErrorCode,
  requireBearerAuth,
} from "@modelcontextprotocol/server";
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AuthRegistry } from "../auth/auth.registry.js";
import { requestLang, toHeaders } from "../common/request.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { type Database, DB } from "../db/db.module.js";
import { MCP_SCOPES, mcpIssuer, mcpResource, mcpResourceMetadataUrl } from "./mcp.config.js";
import { buildMcpServer } from "./mcp.server.js";
import { McpService } from "./mcp.service.js";
import { MCP_DEPS } from "./mcp.tokens.js";
import { MCP_LIMITS, MinuteLimiter } from "./rate-limit.js";
import { McpTokenVerifier } from "./token-verifier.js";
import { MCP_TEXT, type McpCaller, type McpDeps } from "./tools.js";

const IDENTITY_SCOPES = new Set(["openid", "profile", "email", "offline_access"]);

/**
 * Monta en Fastify (fuera del prefijo /api) el endpoint MCP y los metadatos OAuth:
 * - POST /mcp: Streamable HTTP sin estado (2026-07-28 y clientes 2025, ADR 0018).
 * - /.well-known/oauth-protected-resource[/mcp] (RFC 9728).
 * - /.well-known/oauth-authorization-server[/api/auth] y openid-configuration (RFC 8414).
 */
@Injectable()
export class McpRoutes implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("mcp");
  private readonly verifier: McpTokenVerifier;
  private readonly limiter = new MinuteLimiter();
  private handler: McpHttpHandler | undefined;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly registry: AuthRegistry,
    private readonly mcp: McpService,
    @Inject(ENV) private readonly env: Env,
    @Inject(DB) db: Database,
    @Inject(MCP_DEPS) private readonly deps: McpDeps,
  ) {
    this.verifier = new McpTokenVerifier(db, env);
  }

  onModuleInit(): void {
    this.handler = createMcpHandler(
      (ctx) => buildMcpServer(ctx.authInfo?.extra?.caller as McpCaller, this.deps),
      { onerror: (err) => this.log.warn(err.message) },
    );
    const fastify = this.adapterHost.httpAdapter.getInstance<FastifyInstance>();
    fastify.route({
      method: ["GET", "POST", "DELETE"],
      url: "/mcp",
      handler: (req, reply) => this.serve(req, reply),
    });
    fastify.options("/mcp", (_req, reply) => this.cors(reply).status(204).send());
    fastify.get("/.well-known/oauth-protected-resource", (req, reply) => this.resourceMetadata(req, reply));
    fastify.get("/.well-known/oauth-protected-resource/mcp", (req, reply) =>
      this.resourceMetadata(req, reply),
    );
    for (const path of [
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-authorization-server/api/auth",
    ]) {
      fastify.get(path, (req, reply) => this.serverMetadata(req, reply, "oauth"));
    }
    for (const path of ["/.well-known/openid-configuration", "/.well-known/openid-configuration/api/auth"]) {
      fastify.get(path, (req, reply) => this.serverMetadata(req, reply, "openid"));
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.handler?.close();
  }

  private cors(reply: FastifyReply): FastifyReply {
    return reply
      .header("Access-Control-Allow-Origin", "*")
      .header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
      .header(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
      )
      .header("Access-Control-Expose-Headers", "WWW-Authenticate, Mcp-Session-Id");
  }

  /**
   * Copia la respuesta web en Fastify. Cada POST es un intercambio completo y sin estado, así que se
   * envía entera; solo los GET (suscripciones, flujo SSE largo) se reenvían a medida que llegan.
   */
  private async send(reply: FastifyReply, res: Response, stream = false): Promise<FastifyReply> {
    this.cors(reply).status(res.status);
    res.headers.forEach((value, key) => {
      if (key !== "content-length") reply.header(key, value);
    });
    if (!res.body) return reply.send();
    if (stream) return reply.send(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream));
    return reply.send(Buffer.from(await res.arrayBuffer()));
  }

  private async serve(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const lang = requestLang(req, this.env);
    const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
    const url = new URL(req.url, `${proto}://${req.headers.host}`);
    const headers = toHeaders(req.headers);
    const request = new Request(url, {
      method: req.method,
      headers,
      body: req.method === "POST" ? JSON.stringify(req.body ?? null) : undefined,
    });
    const resourceMetadataUrl = mcpResourceMetadataUrl(this.env, lang);
    const gate = requireBearerAuth({
      verifier: { verifyAccessToken: (token) => this.verifier.verify(token, lang) },
      resourceMetadataUrl,
      expectedResource: new URL(mcpResource(this.env, lang)),
    });
    const auth = await gate(request);
    if (auth instanceof Response) return this.send(reply, auth);

    const caller = await this.mcp.caller(auth, lang);
    if (!caller) {
      const revoked = new OAuthError(OAuthErrorCode.InvalidToken, "Connection revoked");
      return this.send(reply, bearerAuthChallengeResponse(revoked, { resourceMetadataUrl }));
    }
    const tokenKey = createHash("sha256").update(auth.token).digest("hex").slice(0, 32);
    const orgs = await this.mcp.orgIds(caller.user);
    const allowed = this.limiter.take([
      { key: `t:${tokenKey}`, limit: MCP_LIMITS.perToken },
      ...orgs.map((o) => ({ key: `o:${o}`, limit: MCP_LIMITS.perOrg })),
    ]);
    if (!allowed) {
      reply.header("Retry-After", "60");
      return this.send(
        reply,
        Response.json(
          { jsonrpc: "2.0", error: { code: -32000, message: MCP_TEXT[lang].errors.rate_limited }, id: null },
          { status: 429 },
        ),
      );
    }
    const res = await (this.handler as McpHttpHandler).fetch(request, {
      authInfo: { ...auth, extra: { ...auth.extra, caller } },
      parsedBody: req.method === "POST" ? req.body : undefined,
    });
    return this.send(reply, res, req.method === "GET");
  }

  /** RFC 9728: recurso, servidor de autorización y permisos del recurso /mcp de este dominio. */
  private resourceMetadata(req: FastifyRequest, reply: FastifyReply) {
    const lang = requestLang(req, this.env);
    const site = this.env.site.siteUrl[lang];
    return this.cors(reply)
      .header("Cache-Control", "public, max-age=3600")
      .send({
        resource: mcpResource(this.env, lang),
        authorization_servers: [mcpIssuer(this.env, lang)],
        scopes_supported: MCP_SCOPES.filter((s) => !IDENTITY_SCOPES.has(s)),
        bearer_methods_supported: ["header"],
        resource_name: lang === "es" ? "Mi Cita en Tiempo" : "My Appointment On Time",
        resource_documentation: `${site}${pathFor("connectAi", lang)}`,
      });
  }

  /** RFC 8414 / OIDC: metadatos del servidor de autorización del dominio (Better Auth). */
  private async serverMetadata(req: FastifyRequest, reply: FastifyReply, kind: "oauth" | "openid") {
    const auth = this.registry.forRequest(req);
    const headers = toHeaders(req.headers);
    const body =
      kind === "oauth"
        ? await auth.api.getOAuthServerConfig({ headers })
        : await auth.api.getOpenIdConfig({ headers });
    return this.cors(reply).header("Cache-Control", "public, max-age=3600").send(body);
  }
}
