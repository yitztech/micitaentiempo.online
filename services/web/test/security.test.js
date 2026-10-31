import { afterEach, describe, expect, it, vi } from "vitest";
import { contentSecurityPolicy } from "../app/lib/security.server.ts";

afterEach(() => vi.unstubAllEnvs());
describe("CSP y registro de errores", () => {
  it("abre en connect-src solo el origen de la DSN, sin la clave", () => {
    vi.stubEnv("SENTRY_DSN", "https://clave@errores.yunitztech.com/2");
    const connect = contentSecurityPolicy("n")
      .split("; ")
      .find((d) => d.startsWith("connect-src"));
    expect(connect).toBe("connect-src 'self' https://errores.yunitztech.com");
  });

  it("sin DSN no añade nada", () => {
    vi.stubEnv("SENTRY_DSN", "");
    const connect = contentSecurityPolicy("n")
      .split("; ")
      .find((d) => d.startsWith("connect-src"));
    expect(connect).toBe("connect-src 'self'");
  });
});
