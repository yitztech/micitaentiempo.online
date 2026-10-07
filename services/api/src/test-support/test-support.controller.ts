import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { SystemService } from "@mcet/contracts/mcet/calendar/v1/system_pb";
import { TestingService } from "@mcet/contracts/mcet/calendar/v1/testing_pb";
import { BadRequestException, Body, Controller, Get, Inject, Post } from "@nestjs/common";
import { z } from "zod";
import { asActor, type CalendarClients } from "../internal-rpc/calendar-client.js";
import { CALENDAR } from "../internal-rpc/internal-rpc.module.js";

const ClockBody = z.object({ now: z.iso.datetime({ offset: true }).nullable().optional() });

/** Solo existe con TEST_MODE (docs/plan/09-pruebas.md §9.2). */
@Controller("__test")
export class TestSupportController {
  constructor(@Inject(CALENDAR) private readonly calendar: CalendarClients) {}

  /** Comprueba api → calendar con un actor de prueba y devuelve lo que ve el motor. */
  @Get("ping")
  async ping() {
    const res = await this.calendar
      .client(SystemService)
      .ping({}, asActor({ actor: { sub: "test-user", role: "observer", via: "panel", loc: "es" } }));
    return { revision: res.revision, actor: { userId: res.actor?.userId, role: res.actor?.role } };
  }

  /** Fija «ahora» en el motor (y en api cuando tenga reloj propio). */
  @Post("clock")
  async setClock(@Body() body: unknown) {
    const parsed = ClockBody.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const now = parsed.data.now ? timestampFromDate(new Date(parsed.data.now)) : undefined;
    const res = await this.calendar
      .client(TestingService)
      .setClock({ now }, asActor({ actor: { role: "system" } }));
    return { now: res.now ? timestampDate(res.now).toISOString() : null };
  }
}
