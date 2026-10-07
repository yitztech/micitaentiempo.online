import { Controller, Get, Inject, Query, Req, Res } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { CurrentUser } from "../auth/auth.guard.js";
import type { SessionUser } from "../auth/auth.registry.js";
import { CalendarAccess } from "../calendars/access.service.js";
import { type Database, DB } from "../db/db.module.js";
import { customerLinks, user as users } from "../db/schema.js";
import { RealtimeBus } from "../internal-rpc/realtime.bus.js";

/** Clientes finales del negocio y flujo de cambios en tiempo real para el panel. */
@Controller("v1")
export class PanelController {
  constructor(
    private readonly access: CalendarAccess,
    private readonly bus: RealtimeBus,
    @Inject(DB) private readonly db: Database,
  ) {}

  /** Clientes finales de las organizaciones donde el usuario es propietario o editor. */
  @Get("customers")
  async customers(@CurrentUser() user: SessionUser, @Query("q") q?: string) {
    const orgs = [
      ...new Set(
        (await this.access.memberships(user.id))
          .filter((m) => m.role === "owner" || m.role === "editor")
          .map((m) => m.orgId),
      ),
    ];
    if (orgs.length === 0) return [];
    const rows = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        orgId: customerLinks.orgId,
        firstBookingAt: customerLinks.firstBookingAt,
        lastBookingAt: customerLinks.lastBookingAt,
        locale: customerLinks.locale,
      })
      .from(customerLinks)
      .innerJoin(users, eq(users.id, customerLinks.userId))
      .where(and(inArray(customerLinks.orgId, orgs)))
      .orderBy(desc(customerLinks.lastBookingAt))
      .limit(500);
    const needle = q?.trim().toLowerCase();
    return rows
      .filter(
        (r) => !needle || r.name.toLowerCase().includes(needle) || r.email.toLowerCase().includes(needle),
      )
      .map((r) => ({
        ...r,
        firstBookingAt: r.firstBookingAt.toISOString(),
        lastBookingAt: r.lastBookingAt.toISOString(),
      }));
  }

  /**
   * SSE: avisa de cambios en los tableros del usuario para que el panel recargue (07-frontend.md §7.4).
   * Solo viajan tipo, tablero, evento y quién lo hizo; los datos se piden con la API normal.
   */
  @Get("stream")
  async stream(@CurrentUser() user: SessionUser, @Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const calendars = new Set((await this.access.memberships(user.id)).map((m) => m.calendarId));
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 5000\n\n");
    const unsubscribe = this.bus.subscribe((c) => {
      if (c.userId) {
        if (c.userId === user.id) res.write(`event: notification\ndata: {}\n\n`);
        return;
      }
      if (!calendars.has(c.calendarId)) return;
      res.write(`event: change\ndata: ${JSON.stringify({ ...c, mine: c.actorUserId === user.id })}\n\n`);
    });
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
    req.raw.on("close", () => {
      clearInterval(ping);
      unsubscribe();
    });
  }
}
