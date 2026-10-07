import { Module } from "@nestjs/common";
import { CalendarsModule } from "../calendars/calendars.module.js";
import { IntegrationsCallbackController, IntegrationsController } from "./integrations.controller.js";

@Module({
  imports: [CalendarsModule],
  controllers: [IntegrationsController, IntegrationsCallbackController],
})
export class IntegrationsModule {}
