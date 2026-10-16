import { Module } from "@nestjs/common";
import { CalendarsModule } from "../calendars/calendars.module.js";
import { MobilePanelController, PublicMobileController } from "./mobile.controller.js";

@Module({
  imports: [CalendarsModule],
  controllers: [PublicMobileController, MobilePanelController],
})
export class MobileModule {}
