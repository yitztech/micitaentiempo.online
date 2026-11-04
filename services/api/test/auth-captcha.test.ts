import { describe, expect, it, vi } from "vitest";
import { type AuthDeps, createAuth } from "../src/auth/auth.factory.js";
import { loadEnv } from "../src/config/env.js";

vi.mock("better-auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("better-auth")>();
  return { ...original, betterAuth: (options: Parameters<typeof original.betterAuth>[0]) => ({ options }) };
});

// Ejecutamos el hook real de la app con el adaptador de contexto de Better Auth sustituido.
vi.mock("better-auth/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("better-auth/api")>()),
  createAuthMiddleware: (handler: unknown) => handler,
}));
vi.mock("../src/security/email-validation.js", () => ({
  checkEmail: async (email: string) => ({ ok: true, normalized: email }),
}));

const env = loadEnv({
  SITE_URL: "https://micitaentiempo.online",
  SITE_URL_EN: "https://myappointmentontime.online",
  DB_PASSWORD: "test-db",
  RPC_SECRET_API_TO_CALENDAR: "a".repeat(32),
  RPC_SECRET_CALENDAR_TO_API: "b".repeat(32),
  SMTP_HOST: "mailpit",
  SMTP_PORT: "1025",
  SMTP_SECURE: "false",
  SMTP_USER: "test",
  SMTP_PASSWORD: "test",
  MAIL_FROM: "Mi Cita <no-reply@micitaentiempo.online>",
  SMTP_USER_EN: "test",
  SMTP_PASSWORD_EN: "test",
  MAIL_FROM_EN: "My Appointment <no-reply@myappointmentontime.online>",
  BETTER_AUTH_SECRET: "c".repeat(32),
  APP_ENC_KEY: "d".repeat(32),
  ALTCHA_HMAC_KEY: "e".repeat(32),
});

function setup(options: { restricted?: boolean; failDb?: boolean } = {}) {
  const select = vi.fn(() => ({
    from: () => ({
      where: async () => {
        if (options.failDb) throw new Error("db_unavailable");
        return options.restricted ? [{ id: "user-1", userId: "user-1" }] : [];
      },
      innerJoin: () => ({
        where: async () => {
          if (options.failDb) throw new Error("db_unavailable");
          return options.restricted ? [{ id: "user-1", userId: "user-1" }] : [];
        },
      }),
    }),
  }));
  const auth = createAuth("es", {
    env,
    db: { select } as unknown as AuthDeps["db"],
    mail: {} as AuthDeps["mail"],
  });
  const before = auth.options.hooks?.before;
  if (!before) throw new Error("Falta el hook de validación de autenticación");
  // El adaptador simulado solo necesita los campos que lee el hook; el contexto completo lo crea Better Auth.
  return {
    run: (path: string) =>
      before({
        path,
        headers: new Headers(),
        body: { name: "Ana López", email: "ana@gmail.com", password: "una-clave-bien-larga-2026" },
      } as unknown as Parameters<typeof before>[0]),
    auth,
    select,
  };
}

describe("CAPTCHA en autenticación con configuración de producción", () => {
  it.each(["/sign-up/email", "/sign-in/email"])("%s admite peticiones sin CAPTCHA", async (path) => {
    const { run, auth } = setup();
    await expect(run(path)).resolves.toBeUndefined();
    expect(auth.options.rateLimit?.enabled).toBe(true);
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(true);
  });

  it.each(["/request-password-reset", "/forget-password"] as const)(
    "%s admite recuperación sin CAPTCHA",
    async (path) => {
      const { run, auth } = setup();
      await expect(run(path)).resolves.toBeUndefined();
      expect(auth.options.rateLimit?.enabled).toBe(true);
      expect(auth.options.rateLimit?.customRules?.[path]).toEqual({ window: 3600, max: 5 });
    },
  );

  it.each([
    "/sign-in/email",
    "/email-otp/send-verification-otp",
    "/sign-in/email-otp",
    "/send-verification-email",
    "/request-password-reset",
    "/forget-password",
  ])("rechaza %s con 401 genérico cuando el correo pertenece a una cuenta restringida", async (path) => {
    const { run } = setup({ restricted: true });
    await expect(run(path)).rejects.toMatchObject({
      status: "UNAUTHORIZED",
      body: { code: "UNAUTHENTICATED" },
    });
  });

  it("falla en cerrado si la consulta de restricción falla en hooks de entrada o sesión", async () => {
    const { run, auth } = setup({ failDb: true });
    await expect(run("/sign-in/email")).rejects.toThrow("db_unavailable");
    const createBefore = auth.options.databaseHooks?.session?.create?.before;
    expect(createBefore).toBeDefined();
    await expect(createBefore?.({ userId: "user-1" } as never)).rejects.toThrow("db_unavailable");
  });

  it("impide crear o renovar sesiones de cuentas restringidas en databaseHooks", async () => {
    const { auth } = setup({ restricted: true });
    const createBefore = auth.options.databaseHooks?.session?.create?.before;
    const updateBefore = auth.options.databaseHooks?.session?.update?.before;
    expect(createBefore).toBeDefined();
    expect(updateBefore).toBeDefined();
    await expect(createBefore?.({ userId: "user-1" } as never)).rejects.toMatchObject({
      status: "UNAUTHORIZED",
      body: { code: "UNAUTHENTICATED" },
    });
    await expect(updateBefore?.({ userId: "user-1" } as never)).rejects.toMatchObject({
      status: "UNAUTHORIZED",
      body: { code: "UNAUTHENTICATED" },
    });
  });
});
