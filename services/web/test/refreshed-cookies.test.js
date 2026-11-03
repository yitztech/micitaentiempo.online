import { describe, expect, it } from "vitest";
import { forwardRefreshedCookies } from "../app/lib/refreshed-cookies.server";

describe("renovación de cookies en cargas del panel", () => {
  it("reenvía cookies separadas y conserva las de la respuesta, incluso en redirecciones", async () => {
    const cookies = [];
    const response = await forwardRefreshedCookies(cookies, async () => {
      await Promise.all([
        Promise.resolve().then(() => cookies.push("session=abc; Path=/; HttpOnly")),
        Promise.resolve().then(() => cookies.push("other=def; Path=/; HttpOnly")),
        Promise.resolve().then(() => cookies.push("session=abc; Path=/; HttpOnly")),
      ]);
      return new Response(null, { status: 302, headers: { "Set-Cookie": "existing=1; Path=/" } });
    });
    expect(response.status).toBe(302);
    expect(response.headers.getSetCookie()).toEqual([
      "existing=1; Path=/",
      "session=abc; Path=/; HttpOnly",
      "other=def; Path=/; HttpOnly",
    ]);
  });
});
