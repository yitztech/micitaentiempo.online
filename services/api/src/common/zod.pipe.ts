import { HttpException, HttpStatus, type PipeTransform } from "@nestjs/common";
import type { z } from "zod";

/** Valida con un esquema Zod compartido (packages/schemas) y devuelve el valor tipado. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(
    private readonly schema: T,
    private readonly status: number = HttpStatus.BAD_REQUEST,
  ) {}

  transform(value: unknown): z.infer<T> {
    const parsed = this.schema.safeParse(value ?? {});
    if (!parsed.success) {
      throw new HttpException(
        {
          code: "validation_failed",
          errors: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            code: i.code,
            message: i.message,
          })),
        },
        this.status,
      );
    }
    return parsed.data;
  }
}
