import { describe, expect, it } from "vitest";
import { holderId, holdToken } from "../src/public-booking/hold-token.js";

const secret = "s".repeat(32);

describe("token del titular de un hold", () => {
  it("es el mismo en un reintento con la misma Idempotency-Key", () => {
    expect(holdToken(secret, "cal", "clave-1234567890")).toBe(holdToken(secret, "cal", "clave-1234567890"));
    expect(holdToken(secret, "cal", "clave-1234567890")).not.toBe(
      holdToken(secret, "otro", "clave-1234567890"),
    );
  });

  it("el motor solo ve un UUID v8 derivado que no revela el token", () => {
    const token = holdToken(secret, "cal", "clave-1234567890");
    const id = holderId(secret, token);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id).not.toContain(token.slice(0, 8));
    expect(holderId("x".repeat(32), token)).not.toBe(id);
  });
});
