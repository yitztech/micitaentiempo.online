import { promises as fs } from "node:fs";
import { UpdateBusinessImages, UpdateBusinessProfile } from "@mcet/schemas";
import { type ArgumentsHost, BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../src/auth/auth.registry.js";
import { BusinessProfileController } from "../src/businesses/business-profile.controller.js";
import type { BusinessProfileService } from "../src/businesses/business-profile.service.js";
import { PublicBusinessController } from "../src/businesses/public-business.controller.js";
import type { PublicBusinessService } from "../src/businesses/public-business.service.js";
import { ProblemFilter } from "../src/common/problem.filter.js";
import { ZodPipe } from "../src/common/zod.pipe.js";
import type { Env } from "../src/config/env.js";

describe("C2 — BusinessProfileController and Validation", () => {
  it("rejects unknown fields with 422 validation_failed using ZodPipe", () => {
    const pipe = new ZodPipe(UpdateBusinessProfile, HttpStatus.UNPROCESSABLE_ENTITY);
    try {
      pipe.transform({
        expectedVersion: 1,
        displayName: "Nombre",
        description: "Descripción",
        primaryCategory: "health",
        secondaryCategories: [],
        websiteUrl: null,
        termsUrl: null,
        socialLinks: [],
        unknownField: "malicious",
      });
      throw new Error("should have failed");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(422);
      expect(httpErr.getResponse()).toMatchObject({
        code: "validation_failed",
      });
    }
  });

  it("rejects invalid social hosts and unsafe URLs with 422", () => {
    const pipe = new ZodPipe(UpdateBusinessProfile, HttpStatus.UNPROCESSABLE_ENTITY);
    try {
      pipe.transform({
        expectedVersion: 1,
        displayName: "Nombre",
        description: "Descripción",
        primaryCategory: "health",
        secondaryCategories: [],
        websiteUrl: "http://insecure.example.com", // Must be https
        termsUrl: null,
        socialLinks: [{ platform: "instagram", url: "https://evil.com/fake" }], // Invalid host
      });
      throw new Error("should have failed");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(422);
    }
  });

  it("requires a valid UUID for Idempotency-Key header on mutations", async () => {
    const mockService = {} as unknown as BusinessProfileService;
    const controller = new BusinessProfileController(mockService);
    const mockRes = { header: vi.fn(), status: vi.fn() } as unknown as FastifyReply;
    const user = { id: "owner-1" } as unknown as SessionUser;
    const req = {} as unknown as FastifyRequest;

    // Missing Idempotency-Key
    await expect(
      controller.updateProfile(
        user,
        {},
        {
          expectedVersion: 1,
          displayName: "Test",
          description: "Desc",
          primaryCategory: null,
          secondaryCategories: [],
          websiteUrl: null,
          termsUrl: null,
          socialLinks: [],
        },
        req,
        mockRes,
      ),
    ).rejects.toThrow(BadRequestException);

    // Invalid UUID for Idempotency-Key
    await expect(
      controller.updateProfile(
        user,
        { "idempotency-key": "not-a-uuid" },
        {
          expectedVersion: 1,
          displayName: "Test",
          description: "Desc",
          primaryCategory: null,
          secondaryCategories: [],
          websiteUrl: null,
          termsUrl: null,
          socialLinks: [],
        },
        req,
        mockRes,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("requires valid UUID in route parameters", async () => {
    const mockService = {} as unknown as BusinessProfileService;
    const controller = new BusinessProfileController(mockService);
    const mockRes = { header: vi.fn(), status: vi.fn() } as unknown as FastifyReply;
    const user = { id: "owner-1" } as unknown as SessionUser;
    const req = {} as unknown as FastifyRequest;

    await expect(
      controller.deleteLocation(
        user,
        "not-a-uuid",
        { "idempotency-key": "019a0000-0000-7000-8000-000000000001" },
        { expectedVersion: 1 },
        req,
        mockRes,
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.assignCalendarLocation(
        user,
        "invalid-calendar-id",
        { "idempotency-key": "019a0000-0000-7000-8000-000000000001" },
        { expectedVersion: 1, locationId: null },
        req,
        mockRes,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("ProblemFilter formats RFC 9457 problem details with Content-Language and translated messages", () => {
    const filter = new ProblemFilter();
    let sentBody: unknown;
    let sentStatus: number | undefined;
    const headers: Record<string, string> = {};

    const mockReply = {
      status: (s: number) => {
        sentStatus = s;
        return mockReply;
      },
      header: (name: string, val: string) => {
        headers[name] = val;
        return mockReply;
      },
      send: (body: unknown) => {
        sentBody = body;
      },
    };

    // 1. Spanish (default)
    const mockHostEs = {
      switchToHttp: () => ({
        getResponse: () => mockReply as unknown as FastifyReply,
        getRequest: () => ({ headers: {}, url: "/api/business-profile" }) as unknown as FastifyRequest,
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new HttpException({ code: "profile_conflict" }, HttpStatus.CONFLICT), mockHostEs);

    expect(sentStatus).toBe(409);
    expect(headers["Content-Type"]).toBe("application/problem+json");
    expect(headers["Content-Language"]).toBe("es");
    expect(sentBody).toMatchObject({
      code: "profile_conflict",
      title: "El perfil cambió en otro dispositivo. Recarga para ver la versión actual.",
      status: 409,
    });

    // 2. English via X-App-Locale
    const mockHostEn = {
      switchToHttp: () => ({
        getResponse: () => mockReply as unknown as FastifyReply,
        getRequest: () =>
          ({
            headers: { "x-app-locale": "en" },
            url: "/api/business-profile",
          }) as unknown as FastifyRequest,
      }),
    } as unknown as ArgumentsHost;

    filter.catch(
      new HttpException({ code: "publication_requirements_not_met" }, HttpStatus.UNPROCESSABLE_ENTITY),
      mockHostEn,
    );

    expect(sentStatus).toBe(422);
    expect(headers["Content-Language"]).toBe("en");
    expect(sentBody).toMatchObject({
      code: "publication_requirements_not_met",
      title: "Complete all requirements before publishing the profile.",
      status: 422,
    });
  });

  it("validates UpdateBusinessImages strictly with ZodPipe (C3)", () => {
    const pipe = new ZodPipe(UpdateBusinessImages, HttpStatus.UNPROCESSABLE_ENTITY);

    // Valid
    const valid = pipe.transform({
      expectedVersion: 2,
      images: [
        {
          id: "019a0000-0000-7000-8000-000000000001",
          alt: "Foto 1",
          cover: true,
        },
        {
          id: "019a0000-0000-7000-8000-000000000002",
          alt: "Foto 2",
          cover: false,
        },
      ],
    });
    expect(valid).toBeDefined();

    // Rejects duplicate image IDs
    expect(() =>
      pipe.transform({
        expectedVersion: 2,
        images: [
          { id: "019a0000-0000-7000-8000-000000000001", alt: "Foto 1", cover: true },
          { id: "019a0000-0000-7000-8000-000000000001", alt: "Foto 1 copia", cover: false },
        ],
      }),
    ).toThrow();

    // Rejects multiple covers
    expect(() =>
      pipe.transform({
        expectedVersion: 2,
        images: [
          { id: "019a0000-0000-7000-8000-000000000001", alt: "Foto 1", cover: true },
          { id: "019a0000-0000-7000-8000-000000000002", alt: "Foto 2", cover: true },
        ],
      }),
    ).toThrow();
  });

  it("PublicBusinessController serves image with nosniff and cache control headers (C3)", async () => {
    const mockService = {
      getPublicImageFile: vi.fn().mockResolvedValue({
        filePath: "/tmp/fake-display.webp",
        mimeType: "image/webp",
      }),
    } as unknown as BusinessProfileService;

    // Spy on fs.readFile
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("RIFF....WEBP"));

    const controller = new PublicBusinessController(
      mockService,
      {} as unknown as PublicBusinessService,
      {} as unknown as Env,
    );
    const headers: Record<string, string> = {};
    let sentBuffer: Buffer | undefined;

    const mockRes = {
      header: (k: string, v: string) => {
        headers[k] = v;
        return mockRes;
      },
      send: (b: Buffer) => {
        sentBuffer = b;
      },
    } as unknown as FastifyReply;

    await controller.getPublicImage(
      "019a0000-0000-7000-8000-000000000010",
      "019a0000-0000-7000-8000-000000000020",
      "display",
      mockRes,
    );

    expect(headers["Content-Type"]).toBe("image/webp");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Cache-Control"]).toBe("public, max-age=300, must-revalidate");
    expect(sentBuffer).toBeDefined();
  });
});
