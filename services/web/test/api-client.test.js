import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, errorText, safeNext } from "../app/lib/api-client.ts";

afterEach(() => vi.unstubAllGlobals());
describe("cliente HTTP y validación del frontend", () => {
  it("envía datos válidos recortados con las cookies del origen", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "org" })));
    vi.stubGlobal("fetch", fetch);
    await expect(
      apiRequest("POST", "/api/v1/org", { name: "  Clínica Sol  ", plan: "personal" }),
    ).resolves.toEqual({ id: "org" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/org",
      expect.objectContaining({
        credentials: "same-origin",
        body: JSON.stringify({ name: "Clínica Sol", plan: "personal" }),
      }),
    );
  });
  it.each([
    ["POST", "/api/auth/sign-up/email", { name: "x".repeat(121) }],
    ["PATCH", "/api/v1/me", { name: "<script>" }],
    ["POST", "/api/public/v1/contact", { name: "Ana", email: "ana@example.com", message: "x".repeat(4001) }],
    ["POST", "/api/v1/calendars/cal/events/id/cancel", { reason: "x".repeat(501) }],
    ["POST", "/api/public/v1/my/bookings/id/cancel", { reason: "\u0000" }],
    ["PATCH", "/api/v1/calendars/cal/events/id", { internalNotes: "x".repeat(2001) }],
  ])("bloquea %s %s antes de la red", async (method, path, body) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(apiRequest(method, path, body)).rejects.toMatchObject({
      status: 400,
      code: "validation_failed",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("acepta respuestas 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiRequest("DELETE", "/api/v1/me")).resolves.toEqual({});
  });
  it("distingue red, rate limiting y errores de negocio", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response("error", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "SLOT_TAKEN" }), { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    await expect(apiRequest("GET", "/api/v1/me")).rejects.toMatchObject({ status: 0, code: "network" });
    await expect(apiRequest("GET", "/api/v1/me")).rejects.toMatchObject({ code: "too_many_requests" });
    await expect(apiRequest("GET", "/api/v1/me")).rejects.toMatchObject({ status: 409, code: "slot_taken" });
    expect(errorText({ too_many_requests: "Espera" }, { status: 429 })).toBe("Espera");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", null])(
    "impide redirecciones externas: %s",
    (next) => {
      expect(safeNext(next, "/panel")).toBe("/panel");
    },
  );
  it("conserva rutas locales", () => expect(safeNext("/panel/cuenta", "/panel")).toBe("/panel/cuenta"));
});
