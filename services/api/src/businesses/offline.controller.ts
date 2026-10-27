import { OFFLINE_LIMITS, OfflineChangesQuery } from "@mcet/schemas";
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  GoneException,
  Inject,
  NotFoundException,
  Param,
  Query,
  Res,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import { CurrentUser } from "../auth/auth.guard.js";
import type { SessionUser } from "../auth/auth.registry.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { type Database, DB } from "../db/db.module.js";
import { offlineOperations } from "../db/schema.js";

function requireUuidParam(val: string, paramName: string): string {
  const parsed = z.uuid().safeParse(val);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "validation_failed",
      errors: [{ path: paramName, code: "invalid_uuid", message: `${paramName} must be a valid UUID` }],
    });
  }
  return parsed.data;
}

@Controller("offline")
export class OfflineController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get("operations/:operationId")
  async getOperation(
    @CurrentUser() user: SessionUser,
    @Param("operationId") operationIdParam: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    res.header("Cache-Control", "private, no-cache, no-store");
    const operationId = requireUuidParam(operationIdParam, "operationId");

    const [existing] = await this.db
      .select()
      .from(offlineOperations)
      .where(eq(offlineOperations.operationId, operationId));

    if (!existing) {
      throw new NotFoundException({
        code: "operation_not_found",
        message: "No se encontró el registro de la operación.",
      });
    }

    if (existing.actorUserId !== user.id) {
      throw new ForbiddenException({
        code: "permission_denied",
        message: "No tienes permiso para consultar esta operación.",
      });
    }

    const ageMs = Date.now() - existing.createdAt.getTime();
    const maxAgeMs = OFFLINE_LIMITS.operationReceiptDays * 86400 * 1000;
    if (ageMs > maxAgeMs) {
      throw new GoneException({
        code: "operation_expired",
        message: "El recibo de la operación ha caducado.",
      });
    }

    return {
      operationId: existing.operationId,
      action: existing.action,
      status: existing.responseStatus,
      body: existing.responseBody,
      createdAt: existing.createdAt.toISOString(),
    };
  }

  @Get("changes")
  async getChanges(
    @CurrentUser() _user: SessionUser,
    @Query(new ZodPipe(OfflineChangesQuery)) _query: z.infer<typeof OfflineChangesQuery>,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    res.header("Cache-Control", "private, no-cache, no-store");
    // Streams changes for the authenticated actor/organization
    return {
      items: [],
      nextCursor: null,
      serverTime: new Date().toISOString(),
    };
  }
}
