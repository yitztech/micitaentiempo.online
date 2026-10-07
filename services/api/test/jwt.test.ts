import { describe, expect, it } from "vitest";
import {
  AUDIENCE_API,
  AUDIENCE_CALENDAR,
  ISSUER_API,
  ISSUER_CALENDAR,
  signInternal,
  verifyInternal,
} from "../src/internal-rpc/jwt.js";

const secret = "secreto-de-pruebas-de-al-menos-32-caracteres";

describe("JWT interno", () => {
  it("firma y verifica el actor", async () => {
    const token = await signInternal(
      secret,
      { sub: "u1", role: "editor", via: "panel", loc: "en" },
      {
        issuer: ISSUER_API,
        audience: AUDIENCE_CALENDAR,
        requestId: "r1",
      },
    );
    const res = await verifyInternal(secret, token, { issuer: ISSUER_API, audience: AUDIENCE_CALENDAR });
    expect(res.actor).toMatchObject({ sub: "u1", role: "editor", loc: "en" });
    expect(res.requestId).toBe("r1");
  });

  it("rechaza otro secreto, emisor o audiencia", async () => {
    const token = await signInternal(
      secret,
      { role: "system" },
      { issuer: ISSUER_CALENDAR, audience: AUDIENCE_API },
    );
    await expect(
      verifyInternal("x".repeat(40), token, { issuer: ISSUER_CALENDAR, audience: AUDIENCE_API }),
    ).rejects.toThrow();
    await expect(
      verifyInternal(secret, token, { issuer: ISSUER_API, audience: AUDIENCE_API }),
    ).rejects.toThrow();
    await expect(
      verifyInternal(secret, token, { issuer: ISSUER_CALENDAR, audience: AUDIENCE_CALENDAR }),
    ).rejects.toThrow();
  });
});
