import { Global, Module } from "@nestjs/common";
import { AppClock } from "../common/clock.js";
import { DeliveryWorker } from "./delivery.worker.js";
import { ChannelHooksController, NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";

@Global()
@Module({
  providers: [AppClock, NotificationsService, DeliveryWorker],
  controllers: [NotificationsController, ChannelHooksController],
  exports: [AppClock, NotificationsService, DeliveryWorker],
})
export class NotificationsModule {}
