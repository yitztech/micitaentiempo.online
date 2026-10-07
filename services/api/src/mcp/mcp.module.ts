import { Module, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import { BillingModule } from "../billing/billing.module.js";
import { BillingService } from "../billing/billing.service.js";
import { CalendarAccess } from "../calendars/access.service.js";
import { CalendarsController } from "../calendars/calendars.controller.js";
import { CalendarsModule } from "../calendars/calendars.module.js";
import { CalendarsService } from "../calendars/calendars.service.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { EventsController, StatsController } from "../events/events.controller.js";
import { PanelController } from "../events/panel.controller.js";
import { IntegrationsController } from "../integrations/integrations.controller.js";
import { NotificationsController } from "../notifications/notifications.controller.js";
import { OrgsService } from "../orgs/orgs.service.js";
import { McpController } from "./mcp.controller.js";
import { McpRoutes } from "./mcp.routes.js";
import { McpService } from "./mcp.service.js";
import { MCP_DEPS } from "./mcp.tokens.js";
import { BulkActions, type McpDeps } from "./tools.js";

/**
 * Servidor MCP dentro de `api`. Las herramientas reutilizan los mismos servicios y controladores que
 * la API REST (registrados aquí como providers), así no hay lógica duplicada.
 */
@Module({
  imports: [CalendarsModule, BillingModule],
  providers: [
    McpService,
    McpRoutes,
    EventsController,
    StatsController,
    CalendarsController,
    PanelController,
    NotificationsController,
    IntegrationsController,
    {
      provide: MCP_DEPS,
      inject: [
        ENV,
        CalendarAccess,
        CalendarsService,
        CalendarsController,
        EventsController,
        StatsController,
        PanelController,
        NotificationsController,
        IntegrationsController,
        BillingService,
        OrgsService,
        AuditService,
      ],
      useFactory: (
        env: Env,
        access: CalendarAccess,
        calendars: CalendarsService,
        calendarsApi: CalendarsController,
        events: EventsController,
        stats: StatsController,
        panel: PanelController,
        notifications: NotificationsController,
        integrations: IntegrationsController,
        billing: BillingService,
        orgs: OrgsService,
        audit: AuditService,
      ): McpDeps => ({
        env,
        access,
        calendars,
        calendarsApi,
        events,
        stats,
        panel,
        notifications,
        integrations,
        billing,
        orgs,
        audit,
        bulk: new BulkActions(),
      }),
    },
  ],
  controllers: [McpController],
})
export class McpModule implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly mcp: McpService) {}

  /** Limpieza horaria de clientes de registro dinámico sin uso (06-mcp.md §6.3). */
  onModuleInit(): void {
    if (process.env.VITEST || process.argv.some((a) => a.includes("scripts/"))) return;
    this.timer = setInterval(() => void this.mcp.cleanup().catch(() => undefined), 60 * 60 * 1000);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }
}
