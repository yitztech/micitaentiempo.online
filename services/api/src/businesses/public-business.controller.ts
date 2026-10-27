import { promises as fs } from "node:fs";
import { isLang, type Lang } from "@mcet/i18n";
import {
  type BusinessDirectoryPage,
  BusinessDirectoryQuery,
  BusinessLocalitiesQuery,
  type BusinessLocalitiesQuery as BusinessLocalitiesQueryType,
  BusinessPageQuery,
  type BusinessPageQuery as BusinessPageQueryType,
  type CategoryPage,
  type LocalityPage,
  type PublicBusinessProfile,
} from "@mcet/schemas";
import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Param,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { Public } from "../auth/auth.guard.js";
import { requestLang } from "../common/request.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { BusinessProfileService } from "./business-profile.service.js";
import { PublicBusinessService } from "./public-business.service.js";

function requireUuidParam(val: string, paramName: string): string {
  const parsed = z.uuid().safeParse(val);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "validation_failed",
      errors: [
        {
          path: paramName,
          code: "invalid_uuid",
          message: `El parámetro ${paramName} debe ser un UUID válido`,
        },
      ],
    });
  }
  return parsed.data;
}

@Controller("public/v1")
export class PublicBusinessController {
  constructor(
    private readonly profileService: BusinessProfileService,
    private readonly publicService: PublicBusinessService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private requestLocale(req: FastifyRequest): Lang {
    const appLocale = req.headers["x-app-locale"];
    if (typeof appLocale === "string" && isLang(appLocale)) return appLocale;
    return requestLang(req, this.env);
  }

  @Get("business-categories")
  @Public()
  async getCategories(
    @Query(new ZodPipe(BusinessPageQuery, HttpStatus.UNPROCESSABLE_ENTITY)) query: BusinessPageQueryType,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<CategoryPage> {
    const lang = this.requestLocale(req);
    res.header("Content-Language", lang);
    res.header("Cache-Control", "public, max-age=300, must-revalidate");
    return this.publicService.listCategories(query.limit, query.cursor, lang);
  }

  @Get("business-localities")
  @Public()
  async getLocalities(
    @Query(new ZodPipe(BusinessLocalitiesQuery, HttpStatus.UNPROCESSABLE_ENTITY))
    query: BusinessLocalitiesQueryType,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LocalityPage> {
    const lang = this.requestLocale(req);
    res.header("Content-Language", lang);
    res.header("Cache-Control", "public, max-age=60, must-revalidate");
    return this.publicService.listLocalities(query);
  }

  @Get("businesses")
  @Public()
  async searchBusinesses(
    @Query(new ZodPipe(BusinessDirectoryQuery, HttpStatus.UNPROCESSABLE_ENTITY))
    query: BusinessDirectoryQuery,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<BusinessDirectoryPage> {
    const lang = this.requestLocale(req);
    res.header("Content-Language", lang);
    if (query.lat !== undefined) {
      res.header("Cache-Control", "private, no-cache, no-store");
    } else {
      res.header("Cache-Control", "public, max-age=60, must-revalidate");
    }
    return this.publicService.searchBusinesses(query, lang);
  }

  @Get("businesses/:businessId")
  @Public()
  async getBusinessProfile(
    @Param("businessId") businessIdParam: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<PublicBusinessProfile> {
    const businessId = requireUuidParam(businessIdParam, "businessId");
    const lang = this.requestLocale(req);
    res.header("Content-Language", lang);
    res.header("Cache-Control", "public, max-age=60, must-revalidate");
    return this.publicService.getPublicProfile(businessId, lang);
  }

  @Get("businesses/:businessId/images/:imageId/:variant")
  @Public()
  async getPublicImage(
    @Param("businessId") businessIdParam: string,
    @Param("imageId") imageIdParam: string,
    @Param("variant") variantParam: string,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const businessId = requireUuidParam(businessIdParam, "businessId");
    const imageId = requireUuidParam(imageIdParam, "imageId");
    const { filePath, mimeType } = await this.profileService.getPublicImageFile(
      businessId,
      imageId,
      variantParam,
    );
    const buffer = await fs.readFile(filePath);
    res.header("Content-Type", mimeType);
    res.header("Cache-Control", "public, max-age=300, must-revalidate");
    res.header("X-Content-Type-Options", "nosniff");
    res.send(buffer);
  }
}
