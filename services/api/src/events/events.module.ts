import { Module } from "@nestjs/common";
import { CalendarsModule } from "../calendars/calendars.module.js";
import { PublicBookingController } from "../public-booking/public-booking.controller.js";
import { EventsController, StatsController } from "./events.controller.js";
import { PanelController } from "./panel.controller.js";

@Module({
  imports: [CalendarsModule],
  controllers: [EventsController, StatsController, PublicBookingController, PanelController],
})
export class EventsModule {}
