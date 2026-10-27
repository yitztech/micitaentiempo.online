import { promises as fs } from "node:fs";
import path from "node:path";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import sharp from "sharp";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";

// Restrict sharp cache and concurrency to maintain container memory within bounds.
sharp.cache(false);
sharp.concurrency(1);

export interface ProcessedImage {
  width: number;
  height: number;
  bytes: number;
  mimeType: "image/webp";
}

@Injectable()
export class BusinessImageService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  getUploadsDir(): string {
    return this.env.UPLOADS_DIR;
  }

  /**
   * Validates binary buffer magic bytes against JPEG, PNG, and WebP signatures.
   */
  validateMagicBytes(buffer: Buffer): "jpeg" | "png" | "webp" {
    if (!buffer || buffer.length < 12) {
      throw new BadRequestException({
        code: "invalid_image",
        message: "Archivo de imagen inválido o dañado",
      });
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "jpeg";
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return "png";
    }

    // WebP: RIFF (bytes 0-3) ... WEBP (bytes 8-11)
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return "webp";
    }

    throw new BadRequestException({ code: "invalid_image", message: "Tipo de imagen no permitido" });
  }

  /**
   * Processes image: strips EXIF metadata, verifies dimensions (<= 25 MP), rejects animated images,
   * generates display and thumbnail WebP derivatives, and saves them atomically to disk.
   */
  async processAndSave(orgId: string, imageId: string, inputBuffer: Buffer): Promise<ProcessedImage> {
    this.validateMagicBytes(inputBuffer);

    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(inputBuffer, { failOnError: true }).metadata();
    } catch {
      throw new BadRequestException({ code: "invalid_image", message: "No se pudo decodificar la imagen" });
    }

    const format = metadata.format;
    if (format !== "jpeg" && format !== "png" && format !== "webp") {
      throw new BadRequestException({ code: "invalid_image", message: "Formato no permitido" });
    }

    // Reject animated images (GIF, animated WebP, APNG)
    if (metadata.pages && metadata.pages > 1) {
      throw new BadRequestException({ code: "invalid_image", message: "Imágenes animadas no permitidas" });
    }

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width <= 0 || height <= 0) {
      throw new BadRequestException({ code: "invalid_image", message: "Dimensiones de imagen inválidas" });
    }

    if (BigInt(width) * BigInt(height) > 25_000_000n) {
      throw new BadRequestException({ code: "invalid_image", message: "La imagen excede 25 megapíxeles" });
    }

    // Generate derivatives (sharp strips EXIF automatically when without withMetadata())
    let displayBuffer: Buffer;
    let thumbnailBuffer: Buffer;
    try {
      displayBuffer = await sharp(inputBuffer)
        .rotate()
        .resize({ width: 1600, height: 1200, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toBuffer();

      thumbnailBuffer = await sharp(inputBuffer)
        .rotate()
        .resize({ width: 320, height: 320, fit: "cover" })
        .webp({ quality: 80, effort: 4 })
        .toBuffer();
    } catch {
      throw new BadRequestException({
        code: "invalid_image",
        message: "Error procesando derivados de imagen",
      });
    }

    const displayMeta = await sharp(displayBuffer).metadata();
    const finalWidth = displayMeta.width ?? width;
    const finalHeight = displayMeta.height ?? height;
    const totalBytes = displayBuffer.byteLength + thumbnailBuffer.byteLength;

    // Atomically save to uploads dir
    const dir = path.join(this.getUploadsDir(), orgId, imageId);
    await fs.mkdir(dir, { recursive: true });

    const tmpDisplay = path.join(dir, `.tmp_display_${Date.now()}.webp`);
    const tmpThumb = path.join(dir, `.tmp_thumb_${Date.now()}.webp`);

    try {
      await fs.writeFile(tmpDisplay, displayBuffer);
      await fs.writeFile(tmpThumb, thumbnailBuffer);
      await fs.rename(tmpDisplay, path.join(dir, "display.webp"));
      await fs.rename(tmpThumb, path.join(dir, "thumbnail.webp"));
    } catch (err) {
      // Cleanup on failure
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }

    return {
      width: finalWidth,
      height: finalHeight,
      bytes: totalBytes,
      mimeType: "image/webp",
    };
  }

  /**
   * Deletes on-disk derivative files and directory for an image.
   */
  async deleteImageFiles(orgId: string, imageId: string): Promise<void> {
    const dir = path.join(this.getUploadsDir(), orgId, imageId);
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  /**
   * Resolves the filesystem path for an image variant.
   */
  getImageFilePath(orgId: string, imageId: string, variant: "thumbnail" | "display"): string {
    return path.join(this.getUploadsDir(), orgId, imageId, `${variant}.webp`);
  }
}
