import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { SessionGuard } from "../src/auth/auth.guard.js";
import { AuthRegistry } from "../src/auth/auth.registry.js";
import { BusinessProfileService } from "../src/businesses/business-profile.service.js";
import { CalendarAccess } from "../src/calendars/access.service.js";
import { CalendarsService } from "../src/calendars/calendars.service.js";
import { MembersService } from "../src/calendars/members.service.js";
import { McpService } from "../src/mcp/mcp.service.js";
import { PublicBookingController } from "../src/public-booking/public-booking.controller.js";

const user = {
  id: "user-a",
  email: "a@example.com",
  name: "A",
  emailVerified: true,
  locale: "es",
  timezone: "UTC",
} as const;

const editor = {
  id: "user-editor",
  email: "editor@example.com",
  name: "Editor",
  emailVerified: true,
  locale: "es",
  timezone: "UTC",
} as const;

describe("aislamiento y estado del plan", () => {
  function access(status: string, restrictedUserIds: string[] = [], ownerUserId = "owner-1") {
    const where = vi
      .fn()
      .mockImplementationOnce(async () => [{ status, ownerUserId }])
      .mockImplementation(async () =>
        restrictedUserIds.includes(ownerUserId) ? [{ userId: ownerUserId }] : [],
      );
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

  it.each([
    ["read_only", "org_read_only"],
    ["suspended", "org_suspended"],
  ] as const)("permite lectura pero deniega cambios con estado %s (%s)", async (status, expectedCode) => {
    const { service } = access(status);
    vi.spyOn(service, "membership").mockResolvedValue({
      calendarId: "cal",
      orgId: "org",
      role: "owner",
      notify: true,
    });
    await expect(service.require(user, "cal", "events.read_all")).resolves.toBeDefined();
    await expect(service.require(user, "cal", "members.manage")).rejects.toMatchObject({
      response: { code: expectedCode },
    });
  });

  it("bloqueo del propietario suspende escrituras para otros miembros con 403 org_suspended pero conserva su lectura privada", async () => {
    const { service } = access("active", ["owner-1"], "owner-1");
    vi.spyOn(service, "membership").mockResolvedValue({
      calendarId: "cal",
      orgId: "org",
      role: "editor",
      notify: true,
    });
    await expect(service.require(editor, "cal", "events.read_all")).resolves.toBeDefined();
    await expect(service.require(editor, "cal", "events.write")).rejects.toMatchObject({
      response: { code: "org_suspended" },
    });
  });

  it("bloqueo de un colaborador no propietario no suspende la organización del propietario", async () => {
    const { service } = access("active", [editor.id], "owner-1");
    vi.spyOn(service, "membership").mockResolvedValue({
      calendarId: "cal",
      orgId: "org",
      role: "owner",
      notify: true,
    });
    await expect(service.require(user, "cal", "events.write")).resolves.toBeDefined();
  });

  it("falla en cerrado si la consulta de restricción falla al verificar escritura en el tablero", async () => {
    const where = vi
      .fn()
      .mockResolvedValueOnce([{ status: "active", ownerUserId: "owner-1" }])
      .mockRejectedValueOnce(new Error("restriction_query_failed"));
    const db = { select: () => ({ from: () => ({ where }) }) };
    const service = new CalendarAccess(db as never);
    vi.spyOn(service, "membership").mockResolvedValue({
      calendarId: "cal",
      orgId: "org",
      role: "editor",
      notify: true,
    });
    await expect(service.require(editor, "cal", "events.write")).rejects.toThrow("restriction_query_failed");
  });

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

  it("impide leer o editar el perfil de negocio y oculta su imagen pública cuando el propietario está restringido", async () => {
    const where = vi
      .fn()
      .mockResolvedValueOnce([{ id: "org-1", ownerUserId: user.id, status: "active" }])
      .mockResolvedValueOnce([{ userId: user.id }])
      .mockResolvedValueOnce([{ id: "org-1", ownerUserId: user.id, status: "active" }])
      .mockResolvedValueOnce([{ userId: user.id }])
      .mockResolvedValueOnce([
        {
          orgId: "org-1",
          ownerUserId: user.id,
          orgStatus: "active",
          status: "published",
        },
      ])
      .mockResolvedValueOnce([{ userId: user.id }]);
    const db = {
      select: () => ({
        from: () => ({
          where,
          innerJoin: () => ({ where }),
        }),
      }),
    };
    const service = new BusinessProfileService(db as never, {} as never, {} as never, {} as never);
    await expect(service.getOwnerOrg(user.id)).rejects.toMatchObject({
      response: { code: "permission_denied" },
    });
    await expect(service.updateProfile(user.id, "key", {} as never)).rejects.toMatchObject({
      response: { code: "permission_denied" },
    });
    await expect(service.getPublicImageFile("org-1", "img-1", "display")).rejects.toMatchObject({
      response: { code: "image_not_found" },
    });
  });

  it("impide crear tableros o aceptar invitaciones cuando el propietario de la organización está restringido", async () => {
    const whereCreate = vi.fn().mockResolvedValueOnce([{ userId: user.id }]);
    const dbCreate = { select: () => ({ from: () => ({ where: whereCreate }) }) };
    const orgs = {
      requireByOwner: vi.fn().mockResolvedValue({ id: "org-1", ownerUserId: user.id, status: "active" }),
    };
    const calendars = new CalendarsService(
      {} as never,
      dbCreate as never,
      orgs as never,
      {} as never,
      {} as never,
    );
    await expect(
      calendars.create(user, { name: "Consultorio", timezone: "UTC" } as never),
    ).rejects.toMatchObject({
      response: { code: "org_suspended" },
    });

    const whereAccept = vi
      .fn()
      .mockResolvedValueOnce([{ id: "org-1", ownerUserId: "owner-1", status: "active" }])
      .mockResolvedValueOnce([{ userId: "owner-1" }]);
    const dbAccept = { select: () => ({ from: () => ({ where: whereAccept }) }) };
    const members = new MembersService(
      dbAccept as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    vi.spyOn(members as unknown as { find: (t: string) => Promise<unknown> }, "find").mockResolvedValue({
      id: "inv-1",
      orgId: "org-1",
      calendarId: "cal-1",
      email: editor.email,
      role: "editor",
      requiresGoogle: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(members.accept(editor, "raw-token")).rejects.toMatchObject({
      response: { code: "org_suspended" },
    });
  });
});

describe("restricción efectiva en sesiones, MCP y reservas públicas", () => {
  it("AuthRegistry.session rechaza usuarios restringidos con null y falla en cerrado ante error de BD", async () => {
    const where = vi
      .fn()
      .mockResolvedValueOnce([{ userId: user.id }])
      .mockRejectedValueOnce(new Error("db_failure"));
    const db = { select: () => ({ from: () => ({ where }) }) };
    const registry = Object.assign(Object.create(AuthRegistry.prototype), {
      db,
      forRequest: () => ({
        api: {
          getSession: vi.fn().mockResolvedValue({
            response: {
              user: {
                id: user.id,
                email: user.email,
                name: user.name,
                emailVerified: true,
                locale: "es",
                timezone: "UTC",
              },
              session: { id: "sess-1", token: "tok-1" },
            },
            headers: new Headers(),
          }),
        },
      }),
    }) as AuthRegistry;

    await expect(registry.session({ headers: {} } as never)).resolves.toBeNull();
    await expect(registry.session({ headers: {} } as never)).rejects.toThrow("db_failure");
  });

  it("McpService.caller rechaza con null cuando la cuenta está restringida sin consultar concesiones y falla en cerrado", async () => {
    const where = vi
      .fn()
      .mockResolvedValueOnce([{ userId: user.id }])
      .mockRejectedValueOnce(new Error("mcp_db_down"));
    const db = { select: () => ({ from: () => ({ where }) }) };
    const mcp = new McpService(
      db as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const authInfo = { clientId: "c1", extra: { userId: user.id } };
    await expect(mcp.caller(authInfo as never, "es")).resolves.toBeNull();
    expect(where).toHaveBeenCalledTimes(1);
    await expect(mcp.caller(authInfo as never, "es")).rejects.toThrow("mcp_db_down");
  });

  it("oculta el calendario público y bloquea holds/confirmaciones cuando el propietario está restringido aunque la proyección esté pendiente", async () => {
    const where = vi.fn(async () => [{ status: "active", ownerUserId: "owner-1", userId: "owner-1" }]);
    const db = { select: () => ({ from: () => ({ where }) }) };
    const confirmHold = vi.fn();
    const rpcClients = {
      client: () => ({
        getCalendarBySlug: vi.fn().mockResolvedValue({
          id: "cal-1",
          orgId: "org-1",
          slug: "clinica",
          name: "Clínica",
          timezone: "UTC",
          status: "active",
          orgStatus: "active",
        }),
        getCalendar: vi.fn().mockResolvedValue({
          id: "cal-1",
          orgId: "org-1",
          status: "active",
          orgStatus: "active",
        }),
        listServices: vi.fn().mockResolvedValue({ services: [] }),
        getEvent: vi.fn().mockResolvedValue({ id: "ev-1", calendarId: "cal-1" }),
        confirmHold,
      }),
    };
    const env = {
      site: { primary: "es", siteUrl: { es: "http://example.com" }, hosts: new Map() },
      APP_ENC_KEY: "a".repeat(32),
    };
    const controller = new PublicBookingController(
      { session: vi.fn().mockResolvedValue(null) } as never,
      { verify: vi.fn().mockResolvedValue(true) } as never,
      env as never,
      rpcClients as never,
      db as never,
    );
    const req = {
      method: "POST",
      headers: {
        host: "example.com",
        origin: "http://example.com",
        "idempotency-key": "11111111-1111-4111-8111-111111111111",
      },
    };
    await expect(controller.profile(req as never, "clinica")).rejects.toMatchObject({
      status: 404,
      response: { code: "calendar_not_found" },
    });
    await expect(
      controller.hold(req as never, "clinica", {
        serviceId: "srv-1",
        start: "2026-06-01T10:00:00Z",
        attendee: { name: "Ana", email: "ana@example.com", timezone: "UTC" },
      } as never),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: "calendar_not_found" },
    });
    await expect(
      controller.confirm(req as never, "ev-1", { holdToken: "tok" } as never),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: "calendar_not_found" },
    });
    expect(confirmHold).not.toHaveBeenCalled();
  });

  it("marca bookable=false y responde 409 calendar_unavailable en solo lectura aunque la proyección al motor siga pendiente", async () => {
    const where = vi.fn(async () => [{ status: "read_only", ownerUserId: "owner-1" }]);
    const db = { select: () => ({ from: () => ({ where }) }) };
    const confirmHold = vi.fn();
    const rpcClients = {
      client: () => ({
        getCalendarBySlug: vi.fn().mockResolvedValue({
          id: "cal-1",
          orgId: "org-1",
          slug: "clinica",
          name: "Clínica",
          timezone: "UTC",
          status: "active",
          orgStatus: "active",
        }),
        getCalendar: vi.fn().mockResolvedValue({
          id: "cal-1",
          orgId: "org-1",
          status: "active",
          orgStatus: "active",
        }),
        listServices: vi.fn().mockResolvedValue({ services: [] }),
        getEvent: vi.fn().mockResolvedValue({ id: "ev-1", calendarId: "cal-1" }),
        confirmHold,
      }),
    };
    const env = {
      site: { primary: "es", siteUrl: { es: "http://example.com" }, hosts: new Map() },
      APP_ENC_KEY: "a".repeat(32),
    };
    const controller = new PublicBookingController(
      { session: vi.fn().mockResolvedValue(null) } as never,
      { verify: vi.fn().mockResolvedValue(true) } as never,
      env as never,
      rpcClients as never,
      db as never,
    );
    const req = {
      method: "POST",
      headers: {
        host: "example.com",
        origin: "http://example.com",
        "idempotency-key": "11111111-1111-4111-8111-111111111111",
      },
    };
    await expect(controller.profile(req as never, "clinica")).resolves.toMatchObject({
      slug: "clinica",
      bookable: false,
    });
    await expect(
      controller.hold(req as never, "clinica", {
        serviceId: "srv-1",
        start: "2026-06-01T10:00:00Z",
        attendee: { name: "Ana", email: "ana@example.com", timezone: "UTC" },
      } as never),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: "calendar_unavailable" },
    });
    await expect(
      controller.confirm(req as never, "ev-1", { holdToken: "tok" } as never),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: "calendar_unavailable" },
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
