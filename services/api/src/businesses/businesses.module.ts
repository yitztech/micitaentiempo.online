import { Module } from "@nestjs/common";
import { BusinessBackfill } from "./business-backfill.service.js";
import { BusinessProfileRepository } from "./business-profile.repository.js";

/** Persistence only. Public and private controllers are added after C1's motor integration. */
@Module({
  providers: [BusinessProfileRepository, BusinessBackfill],
  exports: [BusinessProfileRepository],
})
export class BusinessesModule {}
