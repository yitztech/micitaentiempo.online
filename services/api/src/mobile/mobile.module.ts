import { Module } from "@nestjs/common";
import { CalendarsModule } from "../calendars/calendars.module.js";
import { MobilePanelController, PublicMobileController } from "./mobile.controller.js";
import { MobileAuthLimiter } from "./mobile-auth-limiter.js";

@Module({
  imports: [CalendarsModule],
  controllers: [PublicMobileController, MobilePanelController],
  providers: [MobileAuthLimiter],
})
export class MobileModule {}
