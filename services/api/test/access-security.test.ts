import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { SessionGuard } from "../src/auth/auth.guard.js";
import { BusinessProfileService } from "../src/businesses/business-profile.service.js";
import { CalendarAccess } from "../src/calendars/access.service.js";

const user = {
  id: "user-a",
  email: "a@example.com",
  name: "A",
  emailVerified: true,
  locale: "es",
  timezone: "UTC",
} as const;

describe("aislamiento y estado del plan", () => {
  function access(status: string) {
    const where = vi.fn().mockResolvedValue([{ status }]);
    const db = { select: () => ({ from: () => ({ where }) }) };
    const service = new CalendarAccess(db as never);
    return { service, where };
  }

  it("deniega un tablero ajeno aunque se conozca su identificador", async () => {
    const { service } = access("active");
    vi.spyOn(service, "membership").mockResolvedValue(undefined);
    await expect(service.require(user, "calendar-b", "events.read_all")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each(["read_only", "suspended"])(
    "permite lectura pero deniega cambios con estado %s",
    async (status) => {
      const { service } = access(status);
      vi.spyOn(service, "membership").mockResolvedValue({
        calendarId: "cal",
        orgId: "org",
        role: "owner",
        notify: true,
      });
      await expect(service.require(user, "cal", "events.read_all")).resolves.toBeDefined();
      await expect(service.require(user, "cal", "members.manage")).rejects.toMatchObject({
        response: { code: "org_read_only" },
      });
    },
  );

  it("permite cambios a un propietario con organización activa y deniega al observador", async () => {
    const { service } = access("active");
    const membership = vi
      .spyOn(service, "membership")
      .mockResolvedValue({ calendarId: "cal", orgId: "org", role: "owner", notify: true });
    await expect(service.require(user, "cal", "members.manage")).resolves.toBeDefined();
    membership.mockResolvedValue({ calendarId: "cal", orgId: "org", role: "observer", notify: true });
    await expect(service.require(user, "cal", "members.manage")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("permite leer el perfil en solo lectura, pero no editarlo", async () => {
    const db = { select: () => ({ from: () => ({ where: async () => [{ status: "read_only" }] }) }) };
    const service = new BusinessProfileService(db as never, {} as never, {} as never, {} as never);
    await expect(service.getOwnerOrg(user.id)).resolves.toMatchObject({ status: "read_only" });
    await expect(service.updateProfile(user.id, "key", {} as never)).rejects.toMatchObject({
      response: { code: "org_read_only" },
    });
  });
});

describe("CSRF con sesión", () => {
  it.each(["anything", "Bearer forged"])(
    "no omite CSRF con cookie y Authorization %s",
    async (authorization) => {
      const registry = { session: vi.fn() };
      const env = {
        TEST_MODE: false,
        site: { siteUrl: { es: "https://example.com" }, primary: "es", hosts: new Map() },
      };
      const guard = new SessionGuard(registry as never, new Reflector(), env as never);
      const req = {
        method: "POST",
        headers: {
          host: "example.com",
          origin: "https://attacker.example",
          cookie: "mcet.session_token=valid",
          authorization,
        },
        body: {},
      };
      const ctx = {
        getHandler: () => () => {},
        getClass: () => class {},
        switchToHttp: () => ({ getRequest: () => req }),
      };
      await expect(guard.canActivate(ctx as never)).rejects.toMatchObject({
        response: { code: "bad_origin" },
      });
      expect(registry.session).not.toHaveBeenCalled();
    },
  );
});
