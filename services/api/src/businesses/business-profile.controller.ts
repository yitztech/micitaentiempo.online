import { promises as fs } from "node:fs";
import {
  AssignBusinessCalendar,
  BUSINESS_LIMITS,
  ChangeBusinessPublication,
  CreateBusinessLocation,
  type LocationPage,
  type PrivateBusinessProfile,
  type PrivateLocation,
  UpdateBusinessImages,
  UpdateBusinessLocation,
  type UpdateBusinessLocation as UpdateBusinessLocationType,
  UpdateBusinessProfile,
} from "@mcet/schemas";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { CurrentUser, MultipartUpload } from "../auth/auth.guard.js";
import type { SessionUser } from "../auth/auth.registry.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { BusinessProfileService } from "./business-profile.service.js";

function requireIdempotencyKey(headers: FastifyRequest["headers"]): string {
  const raw = headers["idempotency-key"];
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "invalid_idempotency_key",
      message: "Falta o no es válida la cabecera Idempotency-Key.",
    });
  }
  return parsed.data;
}

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

@Controller("business-profile")
export class BusinessProfileController {
  constructor(private readonly service: BusinessProfileService) {}

  @Get()
  async getProfile(
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<PrivateBusinessProfile> {
    res.header("Cache-Control", "private, no-cache, no-store");
    return this.service.getProfile(user.id);
  }

  @Patch()
  async updateProfile(
    @CurrentUser() user: SessionUser,
    @Headers() headers: FastifyRequest["headers"],
    @Body(new ZodPipe(UpdateBusinessProfile, HttpStatus.UNPROCESSABLE_ENTITY))
    body: UpdateBusinessProfile,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<PrivateBusinessProfile> {
    const idempotencyKey = requireIdempotencyKey(headers);
    res.header("Cache-Control", "private, no-cache, no-store");
    return this.service.updateProfile(user.id, idempotencyKey, body, req.ip);
  }

  @Post("publish")
  async publish(
    @CurrentUser() user: SessionUser,
    @Headers() headers: FastifyRequest["headers"],
    @Body(new ZodPipe(ChangeBusinessPublication, HttpStatus.UNPROCESSABLE_ENTITY))
    body: ChangeBusinessPublication,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<PrivateBusinessProfile> {
    const idempotencyKey = requireIdempotencyKey(headers);
    res.header("Cache-Control", "private, no-cache, no-store");
    return this.service.publish(user.id, idempotencyKey, body, req.ip);
  }

  @Post("unpublish")
  async unpublish(
    @CurrentUser() user: SessionUser,
    @Headers() headers: FastifyRequest["headers"],
    @Body(new ZodPipe(ChangeBusinessPublication, HttpStatus.UNPROCESSABLE_ENTITY))
    body: ChangeBusinessPublication,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<PrivateBusinessProfile> {
    const idempotencyKey = requireIdempotencyKey(headers);
    res.header("Cache-Control", "private, no-cache, no-store");
    return this.service.unpublish(user.id, idempotencyKey, body, req.ip);
  }

  @Get("locations")
  async getLocations(
    @CurrentUser() user: SessionUser,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
    @Res({ passthrough: true }) res?: FastifyReply,
  ): Promise<LocationPage> {
    res?.header("Cache-Control", "private, no-cache, no-store");
    const numLimit = limit ? Number.parseInt(limit, 10) : 20;
    return this.service.getLocations(user.id, Number.isNaN(numLimit) ? 20 : numLimit, cursor);
  }

  @Post("locations")
  async createLocation(
    @CurrentUser() user: SessionUser,
    @Headers() headers: FastifyRequest["headers"],
    @Body(new ZodPipe(CreateBusinessLocation, HttpStatus.UNPROCESSABLE_ENTITY))
    body: CreateBusinessLocation,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<PrivateLocation> {
    const idempotencyKey = requireIdempotencyKey(headers);
    res.header("Cache-Control", "private, no-cache, no-store");
    const result = await this.service.createLocation(user.id, idempotencyKey, body, req.ip);
    res.header("Location", `/api/business-profile/locations/${result.id}`);
    res.status(HttpStatus.CREATED);
    return result;
  }

  @Patch("locations/:id")
  async updateLocation(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Headers() headers: FastifyRequest["headers"],
    @Body(new ZodPipe(UpdateBusinessLocation, HttpStatus.UNPROCESSABLE_ENTITY))
    body: UpdateBusinessLocationType,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<PrivateLocation> {
    const locationId = requireUuidParam(id, "id");
    const idempotencyKey = requireIdempotencyKey(headers);
    res.header("Cache-Control", "private, no-cache, no-store");
    return this.service.updateLocation(user.id, locationId, idempotencyKey, body, req.ip);
  }

  @Delete("locations/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLocation(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Headers() headers: FastifyRequest["headers"],
    @Body(new ZodPipe(ChangeBusinessPublication, HttpStatus.UNPROCESSABLE_ENTITY))
    body: ChangeBusinessPublication,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<void> {
    const locationId = requireUuidParam(id, "id");
    const idempotencyKey = requireIdempotencyKey(headers);
    res.header("Cache-Control", "private, no-cache, no-store");
    await this.service.deleteLocation(user.id, locationId, idempotencyKey, body, req.ip);
  }

  @Put("calendar-locations/:calendarId")
  async assignCalendarLocation(
    @CurrentUser() user: SessionUser,
    @Param("calendarId") calendarIdParam: string,
    @Headers() headers: FastifyRequest["headers"],
    @Body(new ZodPipe(AssignBusinessCalendar, HttpStatus.UNPROCESSABLE_ENTITY))
    body: AssignBusinessCalendar,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<PrivateBusinessProfile> {
    const calendarId = requireUuidParam(calendarIdParam, "calendarId");
    const idempotencyKey = requireIdempotencyKey(headers);
    res.header("Cache-Control", "private, no-cache, no-store");
    return this.service.assignCalendarLocation(user.id, calendarId, idempotencyKey, body, req.ip);
  }

  @Post("images")
  @MultipartUpload()
  async uploadImage(
    @CurrentUser() user: SessionUser,
    @Headers() headers: FastifyRequest["headers"],
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<void> {
    const idempotencyKey = requireIdempotencyKey(headers);
    let expectedVersion: number | null = null;
    let alt: string | null = null;
    let fileBuffer: Buffer | null = null;

    try {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          if (part.fieldname === "file") {
            fileBuffer = await part.toBuffer();
          }
        } else if (part.type === "field") {
          if (part.fieldname === "expectedVersion") {
            const parsed = Number(part.value);
            if (!Number.isInteger(parsed) || parsed < 1) {
              throw new UnprocessableEntityException({
                code: "validation_failed",
                message: "expectedVersion inválido",
              });
            }
            expectedVersion = parsed;
          } else if (part.fieldname === "alt") {
            alt = String(part.value);
          }
        }
      }
    } catch (err: unknown) {
      const fastifyErr = err as { code?: string; statusCode?: number };
      if (fastifyErr?.code === "FST_REQ_FILE_TOO_LARGE" || fastifyErr?.statusCode === 413) {
        throw new PayloadTooLargeException({
          code: "file_too_large",
          message: "La imagen excede el límite de 5 MiB.",
        });
      }
      throw err;
    }

    if (
      !fileBuffer ||
      expectedVersion === null ||
      alt === null ||
      alt.trim().length === 0 ||
      alt.length > BUSINESS_LIMITS.alt
    ) {
      throw new UnprocessableEntityException({
        code: "validation_failed",
        message: "Se requieren los campos file, expectedVersion y alt",
      });
    }

    const result = await this.service.uploadImage(
      user.id,
      idempotencyKey,
      { expectedVersion, alt, fileBuffer },
      req.ip,
    );
    res.status(HttpStatus.CREATED);
    res.header("Location", result.location);
    res.header("Cache-Control", "private, no-cache, no-store");
  }

  @Patch("images")
  async updateImages(
    @CurrentUser() user: SessionUser,
    @Headers() headers: FastifyRequest["headers"],
    @Body(new ZodPipe(UpdateBusinessImages, HttpStatus.UNPROCESSABLE_ENTITY))
    body: UpdateBusinessImages,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<PrivateBusinessProfile> {
    const idempotencyKey = requireIdempotencyKey(headers);
    res.header("Cache-Control", "private, no-cache, no-store");
    return this.service.updateImages(user.id, idempotencyKey, body, req.ip);
  }

  @Delete("images/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteImage(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Headers() headers: FastifyRequest["headers"],
    @Body(new ZodPipe(ChangeBusinessPublication, HttpStatus.UNPROCESSABLE_ENTITY))
    body: ChangeBusinessPublication,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<void> {
    const imageId = requireUuidParam(id, "id");
    const idempotencyKey = requireIdempotencyKey(headers);
    res.header("Cache-Control", "private, no-cache, no-store");
    await this.service.deleteImage(user.id, imageId, idempotencyKey, body, req.ip);
  }

  @Get("images/:imageId/:variant")
  async getImage(
    @CurrentUser() user: SessionUser,
    @Param("imageId") imageIdParam: string,
    @Param("variant") variantParam: string,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const imageId = requireUuidParam(imageIdParam, "imageId");
    const { filePath, mimeType } = await this.service.getImageFile(user.id, imageId, variantParam);
    const buffer = await fs.readFile(filePath);
    res.header("Content-Type", mimeType);
    res.header("Cache-Control", "private, no-cache, no-store");
    res.header("X-Content-Type-Options", "nosniff");
    res.send(buffer);
  }
}
