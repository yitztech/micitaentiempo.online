import { randomBytes } from "node:crypto";
import { type Connection, SyncService } from "@mcet/contracts/mcet/calendar/v1/sync_pb";
import { type Lang, pathFor } from "@mcet/i18n";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { and, eq, gt } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { CurrentUser, Public } from "../auth/auth.guard.js";
import { AuthRegistry, type SessionUser } from "../auth/auth.registry.js";
import { CalendarAccess } from "../calendars/access.service.js";
import { rpc } from "../calendars/rpc-errors.js";
import { AppClock } from "../common/clock.js";
import { hashToken } from "../common/crypto.js";
import { requestLang } from "../common/request.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { type Database, DB } from "../db/db.module.js";
import { channelLinkTokens } from "../db/schema.js";
import { asActor, type CalendarClients } from "../internal-rpc/calendar-client.js";
import { CALENDAR } from "../internal-rpc/internal-rpc.module.js";

type OAuthProvider = "google" | "microsoft";

const SCOPES: Record<OAuthProvider, string> = {
  // Permisos mínimos (04-motor-calendario.md §4.9): exigen verificar la app con Google antes de abrirla.
  google:
    "openid email https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.app.created",
  microsoft: "openid email offline_access User.Read Calendars.ReadWrite",
};

const ICloud = z
  .object({ appleId: z.string().trim().min(3).max(254), appPassword: z.string().trim().min(8).max(64) })
  .strict();
const ExtUpdate = z.object({ useAsBusy: z.boolean(), writeTarget: z.boolean() }).strict();
const FeedBody = z
  .object({ scope: z.enum(["full", "busy"]), label: z.string().trim().max(80).optional() })
  .strict();

export function connectionView(c: Connection) {
  const iso = (t?: { seconds: bigint }) => (t ? new Date(Number(t.seconds) * 1000).toISOString() : null);
  return {
    id: c.id,
    provider: c.provider,
    account: c.account,
    status: c.status,
    lastSyncAt: iso(c.lastSyncAt),
    lastError: c.lastError || null,
    lastErrorAt: iso(c.lastErrorAt),
    calendars: c.calendars.map((x) => ({
      id: x.id,
      name: x.name,
      useAsBusy: x.useAsBusy,
      writeTarget: x.writeTarget,
      appCreated: x.appCreated,
    })),
  };
}

/** Lee el correo del id_token que devuelve el endpoint de tokens (llega por TLS directo del proveedor). */
function emailOfIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      email?: string;
      preferred_username?: string;
    };
    return payload.email ?? payload.preferred_username ?? null;
  } catch {
    return null;
  }
}

/** Calendarios conectados y feeds ICS de un tablero (RF-15). */
@Controller("v1")
export class IntegrationsController {
  constructor(
    private readonly access: CalendarAccess,
    @Inject(CALENDAR) private readonly rpcClients: CalendarClients,
    @Inject(ENV) private readonly env: Env,
    @Inject(DB) private readonly db: Database,
    private readonly clock: AppClock,
  ) {}

  private async sync(user: SessionUser, calendarId: string, write: boolean) {
    const m = await this.access.require(
      user,
      calendarId,
      write ? "integrations.calendar" : "events.read_all",
    );
    return {
      client: this.rpcClients.client(SyncService),
      opts: asActor({ actor: this.access.actor(user, m) }),
    };
  }

  @Get("calendars/:id/integrations")
  async list(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    const { client, opts } = await this.sync(user, id, false);
    const res = await rpc(client.listConnections({ calendarId: id }, opts));
    return {
      connections: res.connections.map(connectionView),
      available: {
        google: Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET),
        microsoft: Boolean(this.env.MS_CLIENT_ID && this.env.MS_CLIENT_SECRET),
        icloud: true,
      },
    };
  }

  /** Inicia OAuth (Google o Microsoft) para conectar el calendario a un tablero. */
  @Get("integrations/:provider/connect")
  async connect(
    @CurrentUser() user: SessionUser,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param("provider") provider: string,
    @Query("calendar") calendarId = "",
  ) {
    if (provider !== "google" && provider !== "microsoft") throw new NotFoundException();
    const id = provider === "google" ? this.env.GOOGLE_CLIENT_ID : this.env.MS_CLIENT_ID;
    if (!id) throw new NotFoundException({ code: "feature_disabled", message: "Proveedor no configurado" });
    await this.access.require(user, calendarId, "integrations.calendar");
    const state = randomBytes(18).toString("base64url");
    await this.db.insert(channelLinkTokens).values({
      tokenHash: hashToken(state),
      userId: user.id,
      channel: `oauth:${provider}`,
      data: { calendarId },
      expiresAt: new Date(this.clock.now().getTime() + 10 * 60_000),
    });
    const lang = requestLang(req, this.env);
    const url = new URL(provider === "google" ? this.env.GOOGLE_AUTHORIZE_URL : this.env.MS_AUTHORIZE_URL);
    url.searchParams.set("client_id", id);
    url.searchParams.set(
      "redirect_uri",
      `${this.env.site.siteUrl[lang]}/api/integrations/${provider}/callback`,
    );
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES[provider]);
    url.searchParams.set("state", state);
    if (provider === "google") {
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("include_granted_scopes", "true");
    } else {
      url.searchParams.set("prompt", "select_account");
    }
    return reply.redirect(url.toString(), 302);
  }

  @Post("calendars/:id/integrations/icloud")
  async icloud(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodPipe(ICloud)) body: z.infer<typeof ICloud>,
  ) {
    const { client, opts } = await this.sync(user, id, true);
    const credentials = new TextEncoder().encode(
      JSON.stringify({ username: body.appleId, password: body.appPassword }),
    );
    return connectionView(
      await rpc(
        client.upsertConnection(
          { calendarId: id, provider: "icloud", account: body.appleId, credentials },
          opts,
        ),
      ),
    );
  }

  @Patch("calendars/:id/integrations/:connectionId/calendars/:extId")
  async updateExt(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Param("connectionId") connectionId: string,
    @Param("extId") extId: string,
    @Body(new ZodPipe(ExtUpdate)) body: z.infer<typeof ExtUpdate>,
  ) {
    const { client, opts } = await this.sync(user, id, true);
    return connectionView(
      await rpc(
        client.updateExternalCalendar(
          {
            connectionId,
            externalCalendarId: extId,
            useAsBusy: body.useAsBusy,
            writeTarget: body.writeTarget,
          },
          opts,
        ),
      ),
    );
  }

  @Post("calendars/:id/integrations/:connectionId/resync")
  async resync(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Param("connectionId") connectionId: string,
  ) {
    const { client, opts } = await this.sync(user, id, true);
    return connectionView(await rpc(client.resyncConnection({ connectionId }, opts)));
  }

  @Delete("calendars/:id/integrations/:connectionId")
  @HttpCode(204)
  async remove(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Param("connectionId") connectionId: string,
  ) {
    const { client, opts } = await this.sync(user, id, true);
    await rpc(client.deleteConnection({ connectionId }, opts));
  }

  private feedUrls(req: FastifyRequest, token: string) {
    const site = this.env.site.siteUrl[requestLang(req, this.env)];
    const https = `${site}/ics/${token}.ics`;
    return { url: https, webcal: https.replace(/^https?:/, "webcal:") };
  }

  @Get("calendars/:id/feeds")
  async feeds(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    const { client, opts } = await this.sync(user, id, false);
    const res = await rpc(client.listFeeds({ calendarId: id }, opts));
    return res.feeds.map((f) => ({ id: f.id, scope: f.scope, label: f.label || null }));
  }

  /** Crea un feed del tablero; el token solo se muestra ahora (se guarda su hash). */
  @Post("calendars/:id/feeds")
  async createFeed(
    @CurrentUser() user: SessionUser,
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body(new ZodPipe(FeedBody)) body: z.infer<typeof FeedBody>,
  ) {
    const { client, opts } = await this.sync(user, id, false);
    const res = await rpc(
      client.createFeed(
        { calendarId: id, scope: body.scope, label: body.label ?? "", locale: requestLang(req, this.env) },
        opts,
      ),
    );
    return { id: res.feed?.id, scope: body.scope, ...this.feedUrls(req, res.token) };
  }

  @Delete("calendars/:id/feeds/:feedId")
  @HttpCode(204)
  async revokeFeed(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Param("feedId") feedId: string,
  ) {
    const { client, opts } = await this.sync(user, id, false);
    await rpc(client.revokeFeed({ id: feedId }, opts));
  }
}

/** Vuelta de OAuth: intercambia el código, entrega los tokens al motor y vuelve a los ajustes del tablero. */
@Public()
@Controller("integrations")
export class IntegrationsCallbackController {
  constructor(
    private readonly access: CalendarAccess,
    @Inject(CALENDAR) private readonly rpcClients: CalendarClients,
    @Inject(ENV) private readonly env: Env,
    @Inject(DB) private readonly db: Database,
    private readonly clock: AppClock,
    private readonly registry: AuthRegistry,
  ) {}

  @Get(":provider/callback")
  async callback(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param("provider") provider: string,
    @Query("code") code?: string,
    @Query("state") state?: string,
  ) {
    const lang: Lang = requestLang(req, this.env);
    if (provider !== "google" && provider !== "microsoft") throw new NotFoundException();
    const [tok] = state
      ? await this.db
          .delete(channelLinkTokens)
          .where(
            and(
              eq(channelLinkTokens.tokenHash, hashToken(state)),
              eq(channelLinkTokens.channel, `oauth:${provider}`),
              gt(channelLinkTokens.expiresAt, this.clock.now()),
            ),
          )
          .returning()
      : [];
    const calendarId = typeof tok?.data?.calendarId === "string" ? tok.data.calendarId : "";
    const back = (status: string) =>
      reply.redirect(`${pathFor("calendarSettings", lang, { id: calendarId || "x" })}?sync=${status}`, 302);
    if (!tok || !code || !calendarId) return back("error");
    // La sesión debe ser la misma persona que empezó la conexión.
    const session = await this.registry.session(req);
    if (!session || session.user.id !== tok.userId) return back("error");
    const id = provider === "google" ? this.env.GOOGLE_CLIENT_ID : this.env.MS_CLIENT_ID;
    const secret = provider === "google" ? this.env.GOOGLE_CLIENT_SECRET : this.env.MS_CLIENT_SECRET;
    const res = await fetch(provider === "google" ? this.env.GOOGLE_TOKEN_URL : this.env.MS_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: id ?? "",
        client_secret: secret ?? "",
        redirect_uri: `${this.env.site.siteUrl[lang]}/api/integrations/${provider}/callback`,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => undefined);
    const data = (await res?.json().catch(() => null)) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      id_token?: string;
    } | null;
    if (!res?.ok || !data?.access_token || !data.refresh_token) return back("error");
    const account = emailOfIdToken(data.id_token) ?? session.user.email;
    const m = await this.access.require(session.user, calendarId, "integrations.calendar").catch(() => null);
    if (!m) return back("error");
    const credentials = new TextEncoder().encode(
      JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expiry: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
      }),
    );
    try {
      await rpc(
        this.rpcClients
          .client(SyncService)
          .upsertConnection(
            { calendarId, provider, account, credentials },
            asActor({ actor: this.access.actor(session.user, m) }),
          ),
      );
    } catch {
      return back("error");
    }
    return back("ok");
  }
}
