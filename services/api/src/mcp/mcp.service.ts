import { en, es, type Lang, pathFor } from "@mcet/i18n";
import type { AuthInfo } from "@modelcontextprotocol/server";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { AuditService } from "../audit/audit.service.js";
import { AuthRegistry, type SessionUser } from "../auth/auth.registry.js";
import { CalendarAccess } from "../calendars/access.service.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { type Database, DB } from "../db/db.module.js";
import {
  mcpGrants,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  user as users,
} from "../db/schema.js";
import { MailService } from "../mail/mail.service.js";
import { aiConnectedEmail } from "../mail/templates/emails.js";
import { OrgsService } from "../orgs/orgs.service.js";
import { MCP_SCOPES } from "./mcp.config.js";
import type { McpCaller } from "./tools.js";

/** URL de retorno de Gemini Enterprise para clientes registrados a mano (06-mcp.md §6.1). */
export const GEMINI_ENTERPRISE_REDIRECT = "https://vertexaisearch.cloud.google.com/oauth-redirect";

const SCOPE_TEXT = { es: es.aiScopes, en: en.aiScopes } as const;

type ClientRow = typeof oauthClient.$inferSelect;

/** Dominio que se muestra al usuario: el del documento CIMD (verificado) o el de su web/retorno. */
export function clientDomain(c: Pick<ClientRow, "clientId" | "uri" | "redirectUris" | "clientDiscoveryId">) {
  const pick = (u: string | null | undefined) => {
    try {
      return u ? new URL(u).hostname : null;
    } catch {
      return null;
    }
  };
  if (c.clientDiscoveryId) return { domain: pick(c.clientId), verified: true };
  return { domain: pick(c.uri) ?? pick(c.redirectUris[0]), verified: false };
}

function isStatic(c: Pick<ClientRow, "metadata">): boolean {
  return (c.metadata as { kind?: string } | null)?.kind === "static";
}

@Injectable()
export class McpService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly access: CalendarAccess,
    private readonly registry: AuthRegistry,
    private readonly orgs: OrgsService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  /**
   * Usuario de un token MCP válido. Sin conexión vigente (revocada en el panel) o con el correo sin
   * verificar, no hay llamante y el token se rechaza.
   */
  async caller(auth: AuthInfo, lang: Lang): Promise<McpCaller | null> {
    const userId = String(auth.extra?.userId ?? "");
    const [grant] = await this.db
      .select()
      .from(mcpGrants)
      .where(and(eq(mcpGrants.clientId, auth.clientId), eq(mcpGrants.userId, userId)));
    if (!grant) return null;
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!u?.emailVerified) return null;
    const user: SessionUser = {
      id: u.id,
      email: u.email,
      name: u.name,
      emailVerified: u.emailVerified,
      locale: u.locale === "en" ? "en" : "es",
      timezone: u.timezone ?? "UTC",
      via: "mcp",
      ...(grant.calendarIds.length ? { calendarIds: grant.calendarIds } : {}),
    };
    await this.touch(grant.clientId, userId);
    return { user, lang, clientId: auth.clientId, scopes: new Set(auth.scopes) };
  }

  /** Organizaciones del usuario (para el límite por organización). */
  async orgIds(user: SessionUser): Promise<string[]> {
    return [...new Set((await this.access.memberships(user.id)).map((m) => m.orgId))];
  }

  private async touch(clientId: string, userId: string): Promise<void> {
    await this.db
      .update(mcpGrants)
      .set({ lastUsedAt: new Date() })
      .where(
        and(
          eq(mcpGrants.clientId, clientId),
          eq(mcpGrants.userId, userId),
          or(isNull(mcpGrants.lastUsedAt), lt(mcpGrants.lastUsedAt, sql`now() - interval '1 minute'`)),
        ),
      );
  }

  private async client(clientId: string): Promise<ClientRow> {
    const [c] = await this.db.select().from(oauthClient).where(eq(oauthClient.clientId, clientId));
    if (!c || c.disabled)
      throw new NotFoundException({ code: "client_not_found", message: "Aplicación desconocida" });
    return c;
  }

  /** Datos de la aplicación para la pantalla de consentimiento. */
  async clientInfo(clientId: string) {
    const c = await this.client(clientId);
    const { domain, verified } = clientDomain(c);
    return { clientId: c.clientId, name: c.name ?? domain ?? c.clientId, uri: c.uri, domain, verified };
  }

  /**
   * Tableros elegidos en el consentimiento (vacío = todos). La primera vez avisa por correo de la
   * nueva conexión, con enlace para revocarla.
   */
  async saveGrant(user: SessionUser, lang: Lang, clientId: string, calendarIds: string[], scopes: string[]) {
    const c = await this.client(clientId);
    const mine = new Set((await this.access.memberships(user.id)).map((m) => m.calendarId));
    if (calendarIds.some((id) => !mine.has(id))) {
      throw new BadRequestException({ code: "unknown_calendar", message: "Tablero no válido" });
    }
    const inserted = await this.db
      .insert(mcpGrants)
      .values({ clientId, userId: user.id, calendarIds })
      .onConflictDoUpdate({ target: [mcpGrants.clientId, mcpGrants.userId], set: { calendarIds } })
      .returning({ createdAt: mcpGrants.createdAt, lastUsedAt: mcpGrants.lastUsedAt });
    const isNew = inserted[0] ? Date.now() - inserted[0].createdAt.getTime() < 5_000 : false;
    await this.audit.record({
      actorUserId: user.id,
      via: "panel",
      action: "mcp.connected",
      target: clientId,
      metadata: { calendars: calendarIds.length || "all", scopes },
    });
    if (isNew) {
      const { domain } = clientDomain(c);
      const valid = scopes.filter((s): s is keyof (typeof SCOPE_TEXT)["es"] => s in SCOPE_TEXT[lang]);
      await this.mail.send({
        lang,
        to: user.email,
        ...(await aiConnectedEmail(lang, {
          app: c.name ?? domain ?? clientId,
          domain: domain ?? clientId,
          scopes: valid.map((s) => SCOPE_TEXT[lang][s]).join("; "),
          url: `${this.env.site.siteUrl[lang]}${pathFor("ai", lang)}`,
        })),
      });
    }
    return { clientId, calendarIds };
  }

  /** Aplicaciones conectadas del usuario (Panel → IA). */
  async connections(user: SessionUser) {
    const rows = await this.db
      .select({ grant: mcpGrants, client: oauthClient })
      .from(mcpGrants)
      .innerJoin(oauthClient, eq(oauthClient.clientId, mcpGrants.clientId))
      .where(eq(mcpGrants.userId, user.id));
    const consents = rows.length
      ? await this.db
          .select()
          .from(oauthConsent)
          .where(
            and(
              eq(oauthConsent.userId, user.id),
              inArray(
                oauthConsent.clientId,
                rows.map((r) => r.client.clientId),
              ),
            ),
          )
      : [];
    return rows.map(({ grant, client }) => {
      const { domain, verified } = clientDomain(client);
      return {
        clientId: client.clientId,
        name: client.name ?? domain ?? client.clientId,
        domain,
        verified,
        static: isStatic(client),
        scopes: consents.find((c) => c.clientId === client.clientId)?.scopes ?? [],
        calendarIds: grant.calendarIds,
        connectedAt: grant.createdAt.toISOString(),
        lastUsedAt: grant.lastUsedAt?.toISOString() ?? null,
      };
    });
  }

  /** Revoca una aplicación: tokens, consentimiento y tableros. Deja de funcionar al instante. */
  async revoke(user: SessionUser, clientId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .update(oauthAccessToken)
        .set({ revoked: now })
        .where(and(eq(oauthAccessToken.clientId, clientId), eq(oauthAccessToken.userId, user.id)));
      await tx
        .update(oauthRefreshToken)
        .set({ revoked: now })
        .where(and(eq(oauthRefreshToken.clientId, clientId), eq(oauthRefreshToken.userId, user.id)));
      await tx
        .delete(oauthConsent)
        .where(and(eq(oauthConsent.clientId, clientId), eq(oauthConsent.userId, user.id)));
      await tx.delete(mcpGrants).where(and(eq(mcpGrants.clientId, clientId), eq(mcpGrants.userId, user.id)));
    });
    await this.audit.record({ actorUserId: user.id, via: "panel", action: "mcp.revoked", target: clientId });
  }

  // ── Clientes estáticos (Gemini Enterprise) ──

  async staticClients(user: SessionUser) {
    const rows = await this.db
      .select()
      .from(oauthClient)
      .where(
        sql`${oauthClient.metadata}->>'kind' = 'static' and ${oauthClient.metadata}->>'ownerUserId' = ${user.id}`,
      );
    return rows.map((c) => ({
      clientId: c.clientId,
      name: c.name ?? "",
      redirectUris: c.redirectUris,
      createdAt: c.createdAt?.toISOString() ?? null,
    }));
  }

  /** Credenciales para Gemini Enterprise: solo propietarios; el secreto se ve una sola vez. */
  async createStaticClient(user: SessionUser, lang: Lang, name: string) {
    const org = await this.orgs.findByOwner(user.id);
    if (!org) throw new ForbiddenException({ code: "permission_denied", message: "Solo propietarios" });
    const res = await this.registry.forLang(lang).api.adminCreateOAuthClient({
      body: {
        client_name: name,
        redirect_uris: [GEMINI_ENTERPRISE_REDIRECT],
        token_endpoint_auth_method: "client_secret_post",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: MCP_SCOPES.join(" "),
        metadata: { kind: "static", ownerUserId: user.id, orgId: org.id },
      },
    });
    await this.audit.record({
      orgId: org.id,
      actorUserId: user.id,
      via: "panel",
      action: "mcp.static_client.created",
      target: res.client_id,
    });
    return {
      clientId: res.client_id,
      clientSecret: res.client_secret ?? null,
      redirectUri: GEMINI_ENTERPRISE_REDIRECT,
    };
  }

  async deleteStaticClient(user: SessionUser, clientId: string): Promise<void> {
    const c = await this.client(clientId);
    const meta = c.metadata as { kind?: string; ownerUserId?: string } | null;
    if (meta?.kind !== "static" || meta.ownerUserId !== user.id) {
      throw new NotFoundException({ code: "client_not_found", message: "Aplicación desconocida" });
    }
    await this.db.delete(oauthClient).where(eq(oauthClient.clientId, clientId));
    await this.audit.record({
      actorUserId: user.id,
      via: "panel",
      action: "mcp.static_client.deleted",
      target: clientId,
    });
  }

  /** Borra los clientes de registro dinámico que no consiguieron ningún token en 24 h. */
  async cleanup(): Promise<number> {
    const res = await this.db.execute(sql`
      delete from ${oauthClient} c
      where c.client_discovery_id is null
        and c.user_id is null
        and coalesce(c.metadata->>'kind', '') <> 'static'
        and c.created_at < now() - interval '24 hours'
        and not exists (select 1 from ${oauthAccessToken} t where t.client_id = c.client_id)
        and not exists (select 1 from ${oauthRefreshToken} t where t.client_id = c.client_id)
        and not exists (select 1 from ${oauthConsent} t where t.client_id = c.client_id)
        and not exists (select 1 from ${mcpGrants} g where g.client_id = c.client_id)`);
    return res.rowCount ?? 0;
  }
}
