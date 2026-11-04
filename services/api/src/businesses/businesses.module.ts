import { Global, Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import { BusinessBackfill } from "./business-backfill.service.js";
import { BusinessImageService } from "./business-image.service.js";
import { BusinessProfileController } from "./business-profile.controller.js";
import { BusinessProfileRepository } from "./business-profile.repository.js";
import { BusinessProfileService } from "./business-profile.service.js";
import { OfflineController } from "./offline.controller.js";
import { OfflineSyncService } from "./offline-sync.service.js";
import { PublicBusinessController } from "./public-business.controller.js";
import { PublicBusinessService } from "./public-business.service.js";

/** Persistence, projection reconciliation, and private business profile API. */
@Global()
@Module({
  controllers: [BusinessProfileController, PublicBusinessController, OfflineController],
  providers: [
    BusinessProfileRepository,
    BusinessBackfill,
    BusinessProfileService,
    PublicBusinessService,
    BusinessImageService,
    OfflineSyncService,
    AuditService,
  ],
  exports: [
    BusinessProfileRepository,
    BusinessBackfill,
    BusinessProfileService,
    PublicBusinessService,
    BusinessImageService,
    OfflineSyncService,
  ],
})
export class BusinessesModule {}
