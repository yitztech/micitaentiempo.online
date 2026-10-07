import { Module, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { BillingController, StripeWebhookController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";

@Module({
  imports: [AuthModule],
  providers: [BillingService],
  controllers: [BillingController, StripeWebhookController],
  exports: [BillingService],
})
export class BillingModule implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly billing: BillingService) {}

  /** Fin de prueba e impago se revisan cada minuto (sin Stripe no hace nada). */
  onModuleInit(): void {
    if (process.env.VITEST || process.argv.some((a) => a.includes("scripts/"))) return;
    this.timer = setInterval(() => void this.billing.sweep().catch(() => undefined), 60_000);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }
}
