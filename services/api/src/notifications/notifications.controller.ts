import { randomBytes, randomInt } from "node:crypto";
import { type Lang, pathFor } from "@mcet/i18n";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, desc, eq, gt } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { CurrentUser, Public } from "../auth/auth.guard.js";
import type { SessionUser } from "../auth/auth.registry.js";
import { AppClock } from "../common/clock.js";
import { hashToken, verify } from "../common/crypto.js";
import { requestLang } from "../common/request.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { type Database, DB } from "../db/db.module.js";
import {
  channelLinkTokens,
  notificationChannels,
  notificationMutes,
  notificationPreferences,
  notifications,
} from "../db/schema.js";
import { features } from "../site/site.controller.js";
import { ChannelError, sendTelegram, sendWhatsApp } from "./channels/senders.js";
import { CHANNELS, GROUPS } from "./groups.js";
import { NotificationsService } from "./notifications.service.js";
import { NOTICES } from "./render.js";

const Preferences = z
  .object({
    matrix: z.record(z.enum(GROUPS), z.record(z.enum(CHANNELS), z.boolean())),
    mutes: z.array(z.string().min(1).max(64)).max(50).default([]),
  })
  .strict();
type Preferences = z.infer<typeof Preferences>;

const Phone = z.object({ phone: z.string().regex(/^\+[1-9]\d{6,14}$/) }).strict();
const Code = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();

/** Bandeja del panel, preferencias y canales del usuario (05-negocio-api.md §5.6). */
@Controller("v1")
export class NotificationsController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly notices: NotificationsService,
    private readonly clock: AppClock,
  ) {}

  @Get("notifications")
  async list(@CurrentUser() user: SessionUser, @Query("limit") limit?: string) {
    const items = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(Math.min(Number(limit) || 20, 100));
    return {
      unread: await this.notices.unreadCount(user.id),
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        params: n.params,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }

  @Post("notifications/read-all")
  @HttpCode(204)
  async readAll(@CurrentUser() user: SessionUser) {
    await this.notices.markRead(user.id);
  }

  @Post("notifications/:id/read")
  @HttpCode(204)
  async read(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    await this.notices.markRead(user.id, id);
  }

  @Get("notification-preferences")
  async preferences(@CurrentUser() user: SessionUser) {
    const f = features(this.env);
    const prefs = await this.db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, user.id));
    const links = await this.db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.userId, user.id));
    const mutes = await this.db.select().from(notificationMutes).where(eq(notificationMutes.userId, user.id));
    const linked = (c: string) => links.find((l) => l.channel === c);
    const matrix = Object.fromEntries(
      GROUPS.map((g) => [
        g,
        Object.fromEntries(
          CHANNELS.map((c) => [c, prefs.find((p) => p.group === g && p.channel === c)?.enabled ?? true]),
        ),
      ]),
    );
    return {
      matrix,
      mutes: mutes.map((m) => m.calendarId),
      channels: {
        email: { available: true, status: "active", label: user.email },
        telegram: {
          available: f.telegram,
          status: linked("telegram")?.status ?? null,
          label: linked("telegram")?.label ?? null,
        },
        slack: {
          available: f.slack,
          status: linked("slack")?.status ?? null,
          label: linked("slack")?.label ?? null,
        },
        whatsapp: {
          available: f.whatsapp,
          status: linked("whatsapp")?.status ?? null,
          label: linked("whatsapp")?.label ?? null,
        },
      },
    };
  }

  @Put("notification-preferences")
  async savePreferences(@CurrentUser() user: SessionUser, @Body(new ZodPipe(Preferences)) body: Preferences) {
    for (const [group, row] of Object.entries(body.matrix)) {
      for (const [channel, enabled] of Object.entries(row ?? {})) {
        await this.db
          .insert(notificationPreferences)
          .values({ userId: user.id, group, channel, enabled })
          .onConflictDoUpdate({
            target: [
              notificationPreferences.userId,
              notificationPreferences.group,
              notificationPreferences.channel,
            ],
            set: { enabled },
          });
      }
    }
    await this.db.delete(notificationMutes).where(eq(notificationMutes.userId, user.id));
    if (body.mutes.length)
      await this.db
        .insert(notificationMutes)
        .values(body.mutes.map((calendarId) => ({ userId: user.id, calendarId })));
    return this.preferences(user);
  }

  /** Enlace al bot de Telegram con un token de 10 minutos (`/start <token>`). */
  @Post("channels/telegram/link")
  async telegramLink(@CurrentUser() user: SessionUser) {
    if (!this.env.TELEGRAM_BOT_TOKEN || !this.env.TELEGRAM_BOT_USERNAME)
      throw new NotFoundException({ code: "feature_disabled", message: "Telegram no disponible" });
    const token = randomBytes(18).toString("base64url");
    await this.db.insert(channelLinkTokens).values({
      tokenHash: hashToken(token),
      userId: user.id,
      channel: "telegram",
      expiresAt: new Date(this.clock.now().getTime() + 10 * 60_000),
    });
    return {
      url: `https://t.me/${this.env.TELEGRAM_BOT_USERNAME}?start=${token}`,
      token: this.env.TEST_MODE ? token : undefined,
    };
  }

  /** Envía un código por WhatsApp (plantilla de autenticación) para verificar el teléfono. */
  @Post("channels/whatsapp/verify")
  @HttpCode(204)
  async whatsappVerify(
    @CurrentUser() user: SessionUser,
    @Req() req: FastifyRequest,
    @Body(new ZodPipe(Phone)) body: z.infer<typeof Phone>,
  ) {
    if (!this.env.WHATSAPP_TOKEN || !this.env.WHATSAPP_PHONE_NUMBER_ID)
      throw new NotFoundException({ code: "feature_disabled", message: "WhatsApp no disponible" });
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.db
      .delete(channelLinkTokens)
      .where(and(eq(channelLinkTokens.userId, user.id), eq(channelLinkTokens.channel, "whatsapp")));
    await this.db.insert(channelLinkTokens).values({
      tokenHash: hashToken(`${user.id}:${code}`),
      userId: user.id,
      channel: "whatsapp",
      data: { phone: body.phone },
      expiresAt: new Date(this.clock.now().getTime() + 10 * 60_000),
    });
    try {
      await sendWhatsApp(
        this.env.WHATSAPP_API_URL,
        this.env.WHATSAPP_TOKEN,
        this.env.WHATSAPP_PHONE_NUMBER_ID,
        body.phone,
        requestLang(req, this.env),
        "mcet_codigo",
        code,
      );
    } catch (err) {
      if (err instanceof ChannelError)
        throw new ServiceUnavailableException({
          code: "whatsapp_unavailable",
          message: "No se pudo enviar el código",
        });
      throw err;
    }
  }

  @Post("channels/whatsapp/confirm")
  async whatsappConfirm(
    @CurrentUser() user: SessionUser,
    @Body(new ZodPipe(Code)) body: z.infer<typeof Code>,
  ) {
    const [tok] = await this.db
      .delete(channelLinkTokens)
      .where(
        and(
          eq(channelLinkTokens.tokenHash, hashToken(`${user.id}:${body.code}`)),
          gt(channelLinkTokens.expiresAt, this.clock.now()),
        ),
      )
      .returning();
    const phone = tok?.data?.phone;
    if (typeof phone !== "string")
      throw new BadRequestException({ code: "invalid_code", message: "Código incorrecto o caducado" });
    await this.notices.activateChannel(user.id, "whatsapp", { phone }, phone.replace(/\d(?=\d{4})/g, "•"));
    return { status: "active" };
  }

  @Delete("channels/:channel")
  @HttpCode(204)
  async unlink(@CurrentUser() user: SessionUser, @Param("channel") channel: string) {
    if (!["telegram", "slack", "whatsapp"].includes(channel)) throw new NotFoundException();
    await this.db
      .delete(notificationChannels)
      .where(
        and(
          eq(notificationChannels.userId, user.id),
          eq(notificationChannels.channel, channel as "telegram"),
        ),
      );
  }

  /** «Añadir a Slack» (OAuth v2, permiso incoming-webhook); el estado ata la vuelta a este usuario. */
  @Get("integrations/slack/install")
  async slackInstall(
    @CurrentUser() user: SessionUser,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    if (!this.env.SLACK_CLIENT_ID || !this.env.SLACK_CLIENT_SECRET)
      throw new NotFoundException({ code: "feature_disabled", message: "Slack no disponible" });
    const state = randomBytes(18).toString("base64url");
    await this.db.insert(channelLinkTokens).values({
      tokenHash: hashToken(state),
      userId: user.id,
      channel: "slack",
      expiresAt: new Date(this.clock.now().getTime() + 10 * 60_000),
    });
    const lang = requestLang(req, this.env);
    const url = new URL(this.env.SLACK_AUTHORIZE_URL);
    url.searchParams.set("client_id", this.env.SLACK_CLIENT_ID);
    url.searchParams.set("scope", "incoming-webhook");
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", `${this.env.site.siteUrl[lang]}/api/integrations/slack/callback`);
    return reply.redirect(url.toString(), 302);
  }
}

/** Webhook del bot de Telegram, «Añadir a Slack» y baja de un clic. */
@Public()
@Controller()
export class ChannelHooksController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly clock: AppClock,
    private readonly notices: NotificationsService,
  ) {}

  /** Telegram llama con X-Telegram-Bot-Api-Secret-Token; `/start <token>` vincula el chat. */
  @Post("webhooks/telegram")
  @HttpCode(200)
  async telegram(
    @Req() req: FastifyRequest,
    @Body() update: {
      message?: { text?: string; chat?: { id?: number; username?: string; first_name?: string } };
    },
  ) {
    if (
      !this.env.TELEGRAM_WEBHOOK_SECRET ||
      req.headers["x-telegram-bot-api-secret-token"] !== this.env.TELEGRAM_WEBHOOK_SECRET
    ) {
      throw new UnauthorizedException();
    }
    const text = update.message?.text ?? "";
    const chatId = update.message?.chat?.id;
    const m = /^\/start\s+([A-Za-z0-9_-]{10,64})$/.exec(text.trim());
    if (!m?.[1] || chatId === undefined) return { ok: true };
    const [tok] = await this.db
      .delete(channelLinkTokens)
      .where(
        and(
          eq(channelLinkTokens.tokenHash, hashToken(m[1])),
          eq(channelLinkTokens.channel, "telegram"),
          gt(channelLinkTokens.expiresAt, this.clock.now()),
        ),
      )
      .returning();
    if (!tok) return { ok: true };
    const chat = update.message?.chat;
    await this.notices.activateChannel(
      tok.userId,
      "telegram",
      { chatId: String(chatId) },
      chat?.username ? `@${chat.username}` : (chat?.first_name ?? "Telegram"),
    );
    if (this.env.TELEGRAM_BOT_TOKEN) {
      const lang: Lang = requestLang(req, this.env);
      await sendTelegram(
        this.env.TELEGRAM_API_URL,
        this.env.TELEGRAM_BOT_TOKEN,
        String(chatId),
        NOTICES[lang].telegramLinked,
      ).catch(() => undefined);
    }
    return { ok: true };
  }

  @Get("integrations/slack/callback")
  async slackCallback(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Query("code") code?: string,
    @Query("state") state?: string,
  ) {
    const lang = requestLang(req, this.env);
    const back = `${pathFor("notificationSettings", lang)}`;
    if (!code || !state || !this.env.SLACK_CLIENT_ID || !this.env.SLACK_CLIENT_SECRET)
      return reply.redirect(`${back}?slack=error`, 302);
    const [tok] = await this.db
      .delete(channelLinkTokens)
      .where(
        and(
          eq(channelLinkTokens.tokenHash, hashToken(state)),
          eq(channelLinkTokens.channel, "slack"),
          gt(channelLinkTokens.expiresAt, this.clock.now()),
        ),
      )
      .returning();
    if (!tok) return reply.redirect(`${back}?slack=error`, 302);
    const res = await fetch(`${this.env.SLACK_API_URL}/oauth.v2.access`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.env.SLACK_CLIENT_ID,
        client_secret: this.env.SLACK_CLIENT_SECRET,
        redirect_uri: `${this.env.site.siteUrl[lang]}/api/integrations/slack/callback`,
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined);
    const data = (await res?.json().catch(() => null)) as {
      ok?: boolean;
      incoming_webhook?: { url?: string; channel?: string };
    } | null;
    const webhook = data?.ok ? data.incoming_webhook?.url : undefined;
    if (!webhook || !/^https?:\/\//.test(webhook)) return reply.redirect(`${back}?slack=error`, 302);
    await this.notices.activateChannel(
      tok.userId,
      "slack",
      { webhookUrl: webhook },
      data?.incoming_webhook?.channel ?? "Slack",
    );
    return reply.redirect(`${back}?slack=ok`, 302);
  }

  /** Baja de un clic (RFC 8058): POST desde el cliente de correo o GET desde el enlace. */
  @Post("public/v1/unsubscribe")
  @HttpCode(200)
  async unsubscribePost(@Query("d") d = "", @Query("s") s = "") {
    await this.unsubscribe(d, s);
    return { ok: true };
  }

  @Get("public/v1/unsubscribe")
  async unsubscribeGet(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Query("d") d = "",
    @Query("s") s = "",
  ) {
    await this.unsubscribe(d, s);
    const lang = requestLang(req, this.env);
    return reply
      .type("text/html; charset=utf-8")
      .send(
        `<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${NOTICES[lang].unsubscribed}</title><body style="font:16px/1.5 system-ui;padding:2rem;max-width:40rem;margin:auto"><p>${NOTICES[lang].unsubscribed}</p></body></html>`,
      );
  }

  private async unsubscribe(d: string, s: string): Promise<void> {
    if (!verify(this.env.APP_ENC_KEY, d, s))
      throw new BadRequestException({ code: "invalid_link", message: "Enlace no válido" });
    const [userId, group, channel] = d.split(".");
    if (!userId || !group || !channel)
      throw new BadRequestException({ code: "invalid_link", message: "Enlace no válido" });
    await this.db
      .insert(notificationPreferences)
      .values({ userId, group, channel, enabled: false })
      .onConflictDoUpdate({
        target: [
          notificationPreferences.userId,
          notificationPreferences.group,
          notificationPreferences.channel,
        ],
        set: { enabled: false },
      });
  }
}
