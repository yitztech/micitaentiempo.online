import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";

const base = {
  SITE_URL: "http://micitaentiempo.localhost:8080",
  SITE_URL_EN: "http://myappointmentontime.localhost:8080",
  DB_PASSWORD: "x",
  RPC_SECRET_API_TO_CALENDAR: "a".repeat(32),
  RPC_SECRET_CALENDAR_TO_API: "b".repeat(32),
  SMTP_HOST: "mailpit",
  SMTP_PORT: "1025",
  SMTP_SECURE: "false",
  SMTP_USER: "u",
  SMTP_PASSWORD: "p",
  MAIL_FROM: "Mi Cita <no-reply@a.localhost>",
  SMTP_USER_EN: "u",
  SMTP_PASSWORD_EN: "p",
  MAIL_FROM_EN: "My Appointment <no-reply@b.localhost>",
  BETTER_AUTH_SECRET: "c".repeat(32),
  APP_ENC_KEY: "d".repeat(32),
  ALTCHA_HMAC_KEY: "e".repeat(32),
};

describe("loadEnv", () => {
  it("acepta la configuración mínima y deriva los dominios", () => {
    const env = loadEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.site.siteUrl.en).toBe("http://myappointmentontime.localhost:8080");
  });

  it("falla si falta la contraseña de la base de datos", () => {
    expect(() => loadEnv({ ...base, DB_PASSWORD: "" })).toThrow(/DB_PASSWORD/);
  });

  it("prohíbe TEST_MODE con dominios reales", () => {
    expect(() =>
      loadEnv({
        ...base,
        TEST_MODE: "1",
        SITE_URL: "https://micitaentiempo.online",
        SITE_URL_EN: "https://myappointmentontime.online",
      }),
    ).toThrow(/TEST_MODE/);
    expect(() => loadEnv({ ...base, TEST_MODE: "1" })).not.toThrow();
  });
});
