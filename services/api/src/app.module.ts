import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { AuthModule } from "./auth/auth.module.js";
import { BillingModule } from "./billing/billing.module.js";
import { CalendarsModule } from "./calendars/calendars.module.js";
import { ConfigModule } from "./config/config.module.js";
import { DbModule } from "./db/db.module.js";
import { EventsModule } from "./events/events.module.js";
import { HealthController } from "./health/health.controller.js";
import { InternalRpcModule } from "./internal-rpc/internal-rpc.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { SiteController } from "./site/site.controller.js";
import { TestSupportController } from "./test-support/test-support.controller.js";

/** Los endpoints /__test solo existen con TEST_MODE (y loadEnv lo prohíbe con dominios reales). */
const testControllers = process.env.TEST_MODE ? [TestSupportController] : [];

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        redact: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
        genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? crypto.randomUUID(),
        autoLogging: { ignore: (req) => req.url === "/api/healthz" },
      },
    }),
    DbModule,
    InternalRpcModule,
    AuthModule,
    CalendarsModule,
    EventsModule,
    NotificationsModule,
    BillingModule,
  ],
  controllers: [HealthController, SiteController, ...testControllers],
})
export class AppModule {}
