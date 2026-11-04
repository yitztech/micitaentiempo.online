import { exportJWK, generateKeyPair, type JWTPayload, SignJWT } from "jose";
import { loadEnv } from "../../src/config/env.js";

export const GOOGLE_TEST_CLIENT = "configured-google-client";
export const GOOGLE_TEST_JWKS = "http://captura:4010/google/jwks";
export const GOOGLE_TEST_TOKEN_URL = "http://captura:4010/google/token";

export function googleTestEnv() {
  return loadEnv({
    SITE_URL: "http://micitaentiempo.localhost:8080",
    SITE_URL_EN: "http://myappointmentontime.localhost:8080",
    DB_PASSWORD: "test-db",
    RPC_SECRET_API_TO_CALENDAR: "a".repeat(32),
    RPC_SECRET_CALENDAR_TO_API: "b".repeat(32),
    SMTP_HOST: "mailpit",
    SMTP_PORT: "1025",
    SMTP_SECURE: "false",
    SMTP_USER: "test",
    SMTP_PASSWORD: "test",
    MAIL_FROM: "Mi Cita <no-reply@a.localhost>",
    SMTP_USER_EN: "test",
    SMTP_PASSWORD_EN: "test",
    MAIL_FROM_EN: "My Appointment <no-reply@b.localhost>",
    BETTER_AUTH_SECRET: "c".repeat(32),
    APP_ENC_KEY: "d".repeat(32),
    ALTCHA_HMAC_KEY: "e".repeat(32),
    GOOGLE_CLIENT_ID: GOOGLE_TEST_CLIENT,
    GOOGLE_CLIENT_SECRET: "test-secret",
    GOOGLE_TOKEN_URL: GOOGLE_TEST_TOKEN_URL,
    GOOGLE_JWKS_FAKE_URL: GOOGLE_TEST_JWKS,
    TEST_MODE: "1",
  });
}

export async function googleSigningFixture() {
  const key = await generateKeyPair("RS256");
  const kid = "google-test-key";
  const jwks = { keys: [{ ...(await exportJWK(key.publicKey)), kid, alg: "RS256", use: "sig" }] };
  return {
    jwks,
    sign(overrides: JWTPayload = {}) {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({
        sub: "google-user-123",
        iat: now - 10,
        exp: now + 3600,
        iss: "https://accounts.google.com",
        aud: GOOGLE_TEST_CLIENT,
        email: "Ana@Gmail.com",
        email_verified: true,
        name: "Ana López",
        ...overrides,
      })
        .setProtectedHeader({ alg: "RS256", kid })
        .sign(key.privateKey);
    },
  };
}
