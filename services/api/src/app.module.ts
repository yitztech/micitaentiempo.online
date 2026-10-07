import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { ConfigModule } from "./config/config.module.js";
import { DbModule } from "./db/db.module.js";
import { HealthController } from "./health/health.controller.js";

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
  ],
  controllers: [HealthController],
})
export class AppModule {}
