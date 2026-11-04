import { MobileGoogleAuth } from "@mcet/schemas";
import { HttpException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AuthRegistry } from "../src/auth/auth.registry.js";
import type { Database } from "../src/db/db.module.js";
import type { CalendarClients } from "../src/internal-rpc/calendar-client.js";
import { PublicMobileController } from "../src/mobile/mobile.controller.js";
import { MobileAuthLimiter } from "../src/mobile/mobile-auth-limiter.js";
import { PublicBookingController } from "../src/public-booking/public-booking.controller.js";
import type { AltchaService } from "../src/security/altcha.service.js";
import {
  GOOGLE_TEST_JWKS,
  GOOGLE_TEST_TOKEN_URL,
  googleSigningFixture,
  googleTestEnv,
} from "./helpers/google-oidc.js";

let fixture: Awaited<ReturnType<typeof googleSigningFixture>>;
beforeAll(async () => {
  fixture = await googleSigningFixture();
});
afterEach(() => vi.unstubAllGlobals());

function setup(
  entry: "mobile" | "web",
  token: string,
  failKeys = false,
  options: { restricted?: boolean; failDb?: boolean; emailVerified?: boolean } = {},
) {
  const env = googleTestEnv();
  const user = {
    id: "user-test",
    email: "ana@gmail.com",
    name: "Ana López",
    emailVerified: options.emailVerified ?? true,
  };
  const adapter = {
    findUserByEmail: vi.fn(async () => ({ user })),
    createUser: vi.fn(async () => user),
    updateUser: vi.fn(async () => user),
    createSession: vi.fn(async () => ({ token: "test-session-token" })),
  };
  const forRequest = vi.fn(() => ({ $context: Promise.resolve({ internalAdapter: adapter }) }));
  const registry = { forRequest } as unknown as AuthRegistry;
  const db = {
    select: () => ({
      from: () => ({
        where: async () => {
          if (options.failDb) throw new Error("db_down");
          return options.restricted ? [{ userId: user.id }] : [];
        },
      }),
    }),
  } as unknown as Database;
  const req = {
    headers: { host: "micitaentiempo.localhost:8080", origin: "http://micitaentiempo.localhost:8080" },
  } as FastifyRequest;
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    if (String(url) === GOOGLE_TEST_TOKEN_URL) return Response.json({ id_token: token });
    if (String(url) === GOOGLE_TEST_JWKS) {
      if (failKeys) throw new Error("internal-key-server-sensitive-details");
      return Response.json(fixture.jwks);
    }
    throw new Error("Unexpected network access");
  });
  vi.stubGlobal("fetch", fetchMock);
  const invoke =
    entry === "mobile"
      ? (input: MobileGoogleAuth) =>
          new PublicMobileController(registry, env, db, new MobileAuthLimiter(db, env)).google(req, input)
      : (input: MobileGoogleAuth) =>
          new PublicBookingController(
            registry,
            {} as AltchaService,
            env,
            {} as CalendarClients,
            db,
          ).googleVerify(req, input);
  return { invoke: (input: MobileGoogleAuth) => invoke(MobileGoogleAuth.parse(input)), adapter, forRequest };
}

async function expectRejected(entry: "mobile" | "web", token: string, code = false, failKeys = false) {
  const { invoke, adapter, forRequest } = setup(entry, token, failKeys);
  let error: unknown;
  try {
    await invoke(code ? { code: "code-test-123" } : { idToken: token });
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(HttpException);
  const httpError = error as HttpException;
  expect(httpError.getStatus()).toBe(400);
  expect(httpError.getResponse()).toEqual({
    code: "google_failed",
    message: "No se pudo verificar con Google",
  });
  expect(forRequest).not.toHaveBeenCalled();
  for (const method of Object.values(adapter)) expect(method).not.toHaveBeenCalled();
}

describe.each(["mobile", "web"] as const)("entrada Google %s sin bypass del verificador", (entry) => {
  it.each(["token", "code"])("crea una sesión solo después de verificar un %s válido", async (kind) => {
    const token = await fixture.sign();
    const { invoke, adapter } = setup(entry, token);
    const input =
      kind === "token"
        ? { idToken: token }
        : {
            code: "code-test-123",
            redirectUri: "micitaentiempo://oauth/google",
            codeVerifier: "pkce-verifier-1234567890",
          };
    const result = await invoke(input);
    expect(result).toMatchObject({
      token: "test-session-token",
      user: { id: "user-test", email: "ana@gmail.com", emailVerified: true },
    });
    expect(adapter.findUserByEmail).toHaveBeenCalledWith("ana@gmail.com");
    expect(adapter.createSession).toHaveBeenCalledExactlyOnceWith("user-test");
  });

  it("rechaza la reproducción de suplantación con alg none sin tocar usuarios ni sesiones", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        email: "victim@example.com",
        email_verified: true,
        aud: "configured-google-client",
        iss: "https://accounts.google.com",
        exp: 1,
      }),
    ).toString("base64url");
    await expectRejected(entry, `${header}.${payload}.fake`);
  });

  it.each([
    ["vencido", { exp: 1 }],
    ["sin caducidad", { exp: undefined }],
    ["audiencia ajena", { aud: "evil-client" }],
    ["emisor ajeno", { iss: "https://evil.example" }],
    ["correo no verificado", { email_verified: false }],
  ])("rechaza token %s aunque esté firmado, sin crear sesión", async (_label, claims) => {
    await expectRejected(entry, await fixture.sign(claims));
  });

  it("rechaza manipular una identidad firmada", async () => {
    const [header, , signature] = (await fixture.sign()).split(".");
    const payload = Buffer.from(
      JSON.stringify({ email: "victim@example.com", email_verified: true }),
    ).toString("base64url");
    await expectRejected(entry, `${header}.${payload}.${signature}`);
  });

  it("rechaza el token inválido devuelto por canje OAuth", async () => {
    await expectRejected(entry, await fixture.sign({ exp: 1 }), true);
  });

  it("oculta detalles del fallo de JWKS y no crea una sesión", async () => {
    await expectRejected(entry, await fixture.sign(), false, true);
  });

  it("rechaza con 401 genérico una cuenta restringida sin actualizar usuario ni crear sesión", async () => {
    const token = await fixture.sign();
    const { invoke, adapter } = setup(entry, token, false, { restricted: true, emailVerified: false });
    await expect(invoke({ idToken: token })).rejects.toMatchObject({
      status: 401,
      response: { code: "unauthenticated", message: "Sesión no válida" },
    });
    expect(adapter.findUserByEmail).toHaveBeenCalledWith("ana@gmail.com");
    expect(adapter.updateUser).not.toHaveBeenCalled();
    expect(adapter.createSession).not.toHaveBeenCalled();
  });

  it("falla en cerrado si falla la consulta de restricción al autenticar con Google", async () => {
    const token = await fixture.sign();
    const { invoke, adapter } = setup(entry, token, false, { failDb: true, emailVerified: false });
    await expect(invoke({ idToken: token })).rejects.toThrow("db_down");
    expect(adapter.updateUser).not.toHaveBeenCalled();
    expect(adapter.createSession).not.toHaveBeenCalled();
  });
});
