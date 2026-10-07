import { Module } from "@nestjs/common";
import { CalendarAccess } from "./access.service.js";
import { CalendarsController, HolidayCatalogController } from "./calendars.controller.js";
import { CalendarsService } from "./calendars.service.js";
import { MembersController } from "./members.controller.js";
import { MembersService } from "./members.service.js";

@Module({
  providers: [CalendarAccess, CalendarsService, MembersService],
  controllers: [CalendarsController, HolidayCatalogController, MembersController],
  exports: [CalendarAccess, CalendarsService],
})
export class CalendarsModule {}
