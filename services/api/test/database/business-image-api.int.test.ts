import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ChangeBusinessPublication, UpdateBusinessImages } from "@mcet/schemas";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuditService } from "../../src/audit/audit.service.js";
import { BusinessImageService } from "../../src/businesses/business-image.service.js";
import { BusinessProfileRepository } from "../../src/businesses/business-profile.repository.js";
import { BusinessProfileService } from "../../src/businesses/business-profile.service.js";
import type { Env } from "../../src/config/env.js";
import { runMigrations } from "../../src/db/migrate.js";
import * as schema from "../../src/db/schema.js";

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let audit: AuditService;
let repository: BusinessProfileRepository;
let imageService: BusinessImageService;
let service: BusinessProfileService;
let tempUploadsDir: string;

const orgA = "019a0000-0000-7000-8000-000000000010";
const orgB = "019a0000-0000-7000-8000-000000000020";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.6-alpine3.24").start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await runMigrations(pool, { log() {} });

  tempUploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcet-uploads-test-"));

  const mockEnv = {
    UPLOADS_DIR: tempUploadsDir,
  } as unknown as Env;

  db = drizzle(pool, { schema });
  audit = new AuditService(db);
  repository = new BusinessProfileRepository(db);
  imageService = new BusinessImageService(mockEnv);
  service = new BusinessProfileService(db, repository, audit, imageService);

  await pool.query(
    "INSERT INTO app.users(id,name,email) VALUES ('owner-a','Ana','a@example.com'),('owner-b','Bea','b@example.com'),('customer-c','Carlos','c@example.com')",
  );
  await pool.query(
    "INSERT INTO app.organizations(id,name,owner_user_id,plan,status) VALUES ($1,'Clínica Dental','owner-a','branches','active'),($2,'Estudio Creativo','owner-b','branches','active')",
    [orgA, orgB],
  );
});

afterAll(async () => {
  await fs.rm(tempUploadsDir, { recursive: true, force: true }).catch(() => {});
  await pool.end();
  await container.stop();
});

describe("BusinessImageService and Image Processing (C3)", () => {
  it("rejects non-image, corrupt, or SVG buffers", async () => {
    const corruptBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');
    expect(() => imageService.validateMagicBytes(corruptBuffer)).toThrow(BadRequestException);

    await expect(imageService.processAndSave(orgA, "img-test-1", corruptBuffer)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("strips EXIF metadata, generates WebP derivatives, and writes atomically", async () => {
    // Create a 200x200 JPEG with EXIF metadata
    const jpegWithExif = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .withMetadata({
        exif: {
          IFD0: {
            Make: "TestCamera",
            Model: "CameraX",
          },
        },
      })
      .jpeg()
      .toBuffer();

    // Verify input JPEG has EXIF
    const inputMeta = await sharp(jpegWithExif).metadata();
    expect(inputMeta.exif).toBeDefined();

    const imageId = "019a0000-0000-7000-8000-000000000101";
    const processed = await imageService.processAndSave(orgA, imageId, jpegWithExif);

    expect(processed.mimeType).toBe("image/webp");
    expect(processed.width).toBe(200);
    expect(processed.height).toBe(200);
    expect(processed.bytes).toBeGreaterThan(0);

    // Verify display WebP file exists and has NO EXIF
    const displayPath = imageService.getImageFilePath(orgA, imageId, "display");
    const displayBuffer = await fs.readFile(displayPath);
    const displayMeta = await sharp(displayBuffer).metadata();
    expect(displayMeta.format).toBe("webp");
    expect(displayMeta.exif).toBeUndefined();

    // Verify thumbnail WebP exists and is 320x320
    const thumbPath = imageService.getImageFilePath(orgA, imageId, "thumbnail");
    const thumbBuffer = await fs.readFile(thumbPath);
    const thumbMeta = await sharp(thumbBuffer).metadata();
    expect(thumbMeta.format).toBe("webp");
    expect(thumbMeta.width).toBe(320);
    expect(thumbMeta.height).toBe(320);

    // Clean up
    await imageService.deleteImageFiles(orgA, imageId);
    await expect(fs.access(displayPath)).rejects.toThrow();
  });
});

describe("BusinessProfileService Image Upload & Lifecycle API (C3)", () => {
  it("uploads an image: sets cover=true for first image, increments version, and replays idempotently", async () => {
    const profile = await service.getProfile("owner-a");
    const expectedVersion = profile.version;

    const samplePng = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: { r: 10, g: 150, b: 80 },
      },
    })
      .png()
      .toBuffer();

    const idempotencyKey = "019a0000-0000-7000-8000-000000000201";
    const res1 = await service.uploadImage("owner-a", idempotencyKey, {
      expectedVersion,
      alt: "Fachada de la clínica",
      fileBuffer: samplePng,
    });

    expect(res1.id).toBeDefined();
    expect(res1.location).toBe(`/api/business-profile/images/${res1.id}/display`);

    // Verify DB record
    const [dbImg] = await db
      .select()
      .from(schema.businessImages)
      .where(eq(schema.businessImages.id, res1.id));
    if (!dbImg) throw new Error("dbImg missing");
    expect(dbImg.cover).toBe(true);
    expect(dbImg.position).toBe(0);
    expect(dbImg.alt).toBe("Fachada de la clínica");
    expect(dbImg.mimeType).toBe("image/webp");

    // Verify profile version incremented
    const updatedProfile = await service.getProfile("owner-a");
    expect(updatedProfile.version).toBe(expectedVersion + 1);

    // Idempotent retry with exact same payload
    const res2 = await service.uploadImage("owner-a", idempotencyKey, {
      expectedVersion,
      alt: "Fachada de la clínica",
      fileBuffer: samplePng,
    });
    expect(res2.id).toBe(res1.id);
    expect(res2.location).toBe(res1.location);

    // Profile version must not change on replay
    const replayedProfile = await service.getProfile("owner-a");
    expect(replayedProfile.version).toBe(updatedProfile.version);

    // Idempotent retry with mismatching payload fails
    await expect(
      service.uploadImage("owner-a", idempotencyKey, {
        expectedVersion,
        alt: "Different Alt Text",
        fileBuffer: samplePng,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("rejects upload with version conflict or non-owner access", async () => {
    const samplePng = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    // Wrong version (outdated)
    await expect(
      service.uploadImage("owner-a", "019a0000-0000-7000-8000-000000000202", {
        expectedVersion: 9999,
        alt: "Logo",
        fileBuffer: samplePng,
      }),
    ).rejects.toThrow(ConflictException);

    // Customer C (non-owner)
    await expect(
      service.uploadImage("customer-c", "019a0000-0000-7000-8000-000000000203", {
        expectedVersion: 1,
        alt: "Logo",
        fileBuffer: samplePng,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("updates and reorders images: updates alt, reassigns cover, and validates ownership", async () => {
    let profile = await service.getProfile("owner-a");

    // Upload a second image
    const samplePng2 = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 50, g: 50, b: 200 } },
    })
      .png()
      .toBuffer();

    const img2 = await service.uploadImage("owner-a", "019a0000-0000-7000-8000-000000000204", {
      expectedVersion: profile.version,
      alt: "Consultorio dental",
      fileBuffer: samplePng2,
    });

    profile = await service.getProfile("owner-a");

    const images = await db.select().from(schema.businessImages).where(eq(schema.businessImages.orgId, orgA));
    expect(images.length).toBe(2);

    const firstImg = images.find((i) => i.id !== img2.id);
    const secondImg = images.find((i) => i.id === img2.id);
    if (!firstImg || !secondImg) throw new Error("images missing");
    expect(firstImg.cover).toBe(true);
    expect(secondImg.cover).toBe(false);

    // Reorder: make secondImg cover and position 0
    const updateBody: UpdateBusinessImages = {
      expectedVersion: profile.version,
      images: [
        { id: secondImg.id, alt: "Consultorio principal renovado", cover: true },
        { id: firstImg.id, alt: "Entrada principal", cover: false },
      ],
    };

    const updateRes = await service.updateImages(
      "owner-a",
      "019a0000-0000-7000-8000-000000000205",
      updateBody,
    );
    expect(updateRes.version).toBe(profile.version + 1);

    // Verify DB updated positions and cover
    const [reorderedSecond] = await db
      .select()
      .from(schema.businessImages)
      .where(eq(schema.businessImages.id, secondImg.id));
    const [reorderedFirst] = await db
      .select()
      .from(schema.businessImages)
      .where(eq(schema.businessImages.id, firstImg.id));
    if (!reorderedSecond || !reorderedFirst) throw new Error("reordered missing");
    expect(reorderedSecond.cover).toBe(true);
    expect(reorderedSecond.position).toBe(0);
    expect(reorderedSecond.alt).toBe("Consultorio principal renovado");

    expect(reorderedFirst.cover).toBe(false);
    expect(reorderedFirst.position).toBe(1);

    // Attempting to reorder with an image ID belonging to another org or nonexistent fails
    await expect(
      service.updateImages("owner-a", "019a0000-0000-7000-8000-000000000206", {
        expectedVersion: updateRes.version,
        images: [{ id: "019a0000-0000-7000-8000-ffffffffffff", alt: "Otro", cover: true }],
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it("deletes an image: removes DB row, deletes files, and promotes remaining image to cover", async () => {
    let profile = await service.getProfile("owner-a");

    const images = await db.select().from(schema.businessImages).where(eq(schema.businessImages.orgId, orgA));
    const coverImg = images.find((i) => i.cover);
    const otherImg = images.find((i) => !i.cover);
    if (!coverImg || !otherImg) throw new Error("cover or other image missing");

    // Check files exist before delete
    const filePath = imageService.getImageFilePath(orgA, coverImg.id, "display");
    await expect(fs.access(filePath)).resolves.toBeUndefined();

    const deleteBody: ChangeBusinessPublication = { expectedVersion: profile.version };
    await service.deleteImage("owner-a", coverImg.id, "019a0000-0000-7000-8000-000000000207", deleteBody);

    // Verify row is deleted
    const [deletedRow] = await db
      .select()
      .from(schema.businessImages)
      .where(eq(schema.businessImages.id, coverImg.id));
    expect(deletedRow).toBeUndefined();

    // Verify files are deleted from disk
    await expect(fs.access(filePath)).rejects.toThrow();

    // Verify remaining image was promoted to cover
    const [promotedImg] = await db
      .select()
      .from(schema.businessImages)
      .where(eq(schema.businessImages.id, otherImg.id));
    if (!promotedImg) throw new Error("promotedImg missing");
    expect(promotedImg.cover).toBe(true);

    profile = await service.getProfile("owner-a");
    expect(profile.version).toBe(deleteBody.expectedVersion + 1);

    // Deleting already deleted image returns 404
    await expect(
      service.deleteImage("owner-a", coverImg.id, "019a0000-0000-7000-8000-000000000208", {
        expectedVersion: profile.version,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("serves private image to owner and public image only when published and active", async () => {
    const images = await db.select().from(schema.businessImages).where(eq(schema.businessImages.orgId, orgA));
    const existingImg = images[0];
    if (!existingImg) throw new Error("existingImg missing");

    // Owner can fetch private thumbnail and display
    const privateFile = await service.getImageFile("owner-a", existingImg.id, "display");
    expect(privateFile.filePath).toContain("display.webp");
    expect(privateFile.mimeType).toBe("image/webp");

    // Other owner (owner-b) cannot access private image of orgA
    await expect(service.getImageFile("owner-b", existingImg.id, "display")).rejects.toThrow(
      NotFoundException,
    );

    // Invalid variant returns BadRequestException
    await expect(service.getImageFile("owner-a", existingImg.id, "invalid_variant")).rejects.toThrow(
      BadRequestException,
    );

    // Public delivery: orgA profile is currently draft -> public request must return 404
    await expect(service.getPublicImageFile(orgA, existingImg.id, "display")).rejects.toThrow(
      NotFoundException,
    );

    // Set profile to published with required fields satisfying check constraint
    await pool.query(
      "UPDATE app.business_profiles SET status = 'published', display_name = 'Clínica Dental', description = 'Descripción completa para publicación', primary_category_id = 'health', published_at = now() WHERE org_id = $1",
      [orgA],
    );

    // Now public delivery succeeds
    const publicFile = await service.getPublicImageFile(orgA, existingImg.id, "display");
    expect(publicFile.filePath).toBe(privateFile.filePath);

    // If organization is suspended -> public delivery returns 404
    await pool.query("UPDATE app.organizations SET status = 'suspended' WHERE id = $1", [orgA]);
    await expect(service.getPublicImageFile(orgA, existingImg.id, "display")).rejects.toThrow(
      NotFoundException,
    );

    // Restore active
    await pool.query("UPDATE app.organizations SET status = 'active' WHERE id = $1", [orgA]);
    await pool.query("UPDATE app.business_profiles SET status = 'draft' WHERE org_id = $1", [orgA]);
  });

  it("enforces image limit of 10 images per profile", async () => {
    let profile = await service.getProfile("owner-a");
    const currentImages = await db
      .select()
      .from(schema.businessImages)
      .where(eq(schema.businessImages.orgId, orgA));

    const samplePng = await sharp({
      create: { width: 30, height: 30, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .png()
      .toBuffer();

    // Fill up to 10 images
    for (let i = currentImages.length; i < 10; i++) {
      const key = `019a0000-0000-7000-8000-${(300 + i).toString(16).padStart(12, "0")}`;
      await service.uploadImage("owner-a", key, {
        expectedVersion: profile.version,
        alt: `Imagen ${i + 1}`,
        fileBuffer: samplePng,
      });
      profile = await service.getProfile("owner-a");
    }

    const totalNow = await db
      .select()
      .from(schema.businessImages)
      .where(eq(schema.businessImages.orgId, orgA));
    expect(totalNow.length).toBe(10);

    // 11th image must fail with image_limit_reached (422)
    const key11 = "019a0000-0000-7000-8000-000000000399";
    await expect(
      service.uploadImage("owner-a", key11, {
        expectedVersion: profile.version,
        alt: "Imagen 11",
        fileBuffer: samplePng,
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});
