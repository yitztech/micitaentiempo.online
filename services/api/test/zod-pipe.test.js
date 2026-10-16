import { CancelBooking, ContactMessage, FullName } from "@mcet/schemas";
import { describe, expect, it } from "vitest";
import { ZodPipe } from "../src/common/zod.pipe.ts";

describe("validación del backend", () => {
  it("devuelve el valor validado y normalizado", () =>
    expect(new ZodPipe(FullName).transform(" Ana López ")).toBe("Ana López"));
  it.each([
    [FullName, "x".repeat(121), ""],
    [ContactMessage, { name: "Ana", email: "a@example.com", message: "\u0000invalid text" }, "message"],
    [CancelBooking, { reason: "x".repeat(501) }, "reason"],
  ])("responde 400 con la ruta del campo", (schema, input, path) => {
    try {
      new ZodPipe(schema).transform(input);
      throw new Error("debe rechazar");
    } catch (error) {
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        code: "validation_failed",
        errors: expect.arrayContaining([expect.objectContaining({ path })]),
      });
    }
  });
});
