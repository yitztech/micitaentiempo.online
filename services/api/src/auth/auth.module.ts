import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuditService } from "../audit/audit.service.js";
import { MailService } from "../mail/mail.service.js";
import { MeController } from "../me/me.controller.js";
import { OrgsController } from "../orgs/orgs.controller.js";
import { OrgsService } from "../orgs/orgs.service.js";
import { AltchaService } from "../security/altcha.service.js";
import { SecurityController } from "../security/security.controller.js";
import { SessionGuard } from "./auth.guard.js";
import { AuthRegistry } from "./auth.registry.js";
import { AuthRoutes } from "./auth.routes.js";

@Global()
@Module({
  providers: [
    MailService,
    AltchaService,
    AuditService,
    AuthRegistry,
    AuthRoutes,
    OrgsService,
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  controllers: [MeController, OrgsController, SecurityController],
  exports: [MailService, AltchaService, AuditService, AuthRegistry, OrgsService],
})
export class AuthModule {}
