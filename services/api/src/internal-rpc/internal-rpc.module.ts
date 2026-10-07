import { Global, Inject, Module } from "@nestjs/common";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { type CalendarClients, calendarClients } from "./calendar-client.js";
import { EventIngressService } from "./event-ingress.service.js";
import { InternalRpcServer } from "./internal-rpc.server.js";

export const CALENDAR = Symbol("CALENDAR");

@Global()
@Module({
  providers: [
    EventIngressService,
    InternalRpcServer,
    {
      provide: CALENDAR,
      inject: [ENV],
      useFactory: (env: Env): CalendarClients =>
        calendarClients(env.CALENDAR_RPC_URL, env.RPC_SECRET_API_TO_CALENDAR),
    },
  ],
  exports: [CALENDAR, EventIngressService],
})
export class InternalRpcModule {
  constructor(@Inject(CALENDAR) readonly calendar: CalendarClients) {}
}
