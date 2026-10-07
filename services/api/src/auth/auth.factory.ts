import type { Lang } from "@mcet/i18n";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { bearer, emailOTP, haveIBeenPwned, twoFactor } from "better-auth/plugins";
import type { Env } from "../config/env.js";
import type { Database } from "../db/db.module.js";
import * as schema from "../db/schema.js";
import type { MailService } from "../mail/mail.service.js";
import { otpEmail, resetPasswordEmail, verifyEmail } from "../mail/templates/emails.js";
import { checkEmail, type EmailProblem } from "../security/email-validation.js";
import { uuidv7 } from "./ids.js";
import { hashPassword, verifyPassword } from "./password.js";

export interface AuthDeps {
  env: Env;
  db: Database;
  mail: MailService;
  /** Verifica la cabecera x-altcha (antibots). */
  verifyAltcha: (header: string | undefined) => Promise<boolean>;
}

const EMAIL_ERRORS: Record<Lang, Record<EmailProblem, string>> = {
  es: {
    invalid_format: "El correo no tiene un formato válido.",
    no_mail_server: "Ese dominio no recibe correo. Revisa que esté bien escrito.",
    disposable: "No se admiten correos temporales. Usa tu correo habitual.",
  },
  en: {
    invalid_format: "That email address isn't valid.",
    no_mail_server: "That domain doesn't receive email. Check the spelling.",
    disposable: "Temporary email addresses aren't allowed. Please use your regular email.",
  },
};

const ALTCHA_MESSAGE: Record<Lang, string> = {
  es: "No pudimos comprobar que no eres un robot. Recarga la página e inténtalo de nuevo.",
  en: "We couldn't verify you're not a robot. Reload the page and try again.",
};

const PWNED_MESSAGE: Record<Lang, string> = {
  es: "Esa contraseña apareció en una filtración conocida. Elige otra.",
  en: "That password appeared in a known data breach. Choose another one.",
};

/** Rutas que envían correos a direcciones nuevas: exigen ALTCHA. */
const ALTCHA_PATHS = new Set(["/sign-up/email", "/email-otp/send-verification-otp", "/forget-password"]);

/** Rutas de Better Auth que reciben un correo nuevo y deben validarlo (RF-02). */
const EMAIL_PATHS = new Set(["/sign-up/email", "/email-otp/send-verification-otp", "/sign-in/email-otp"]);

function userLang(user: { locale?: unknown }, fallback: Lang): Lang {
  return user.locale === "en" || user.locale === "es" ? user.locale : fallback;
}

/**
 * Better Auth para un dominio (ADR 0006): baseURL, cookies y emisor propios; misma base de datos.
 * El idioma de los correos es el de la cuenta (y, al registrarse, el del dominio).
 */
export function createAuth(lang: Lang, { env, db, mail, verifyAltcha }: AuthDeps) {
  const baseURL = env.site.siteUrl[lang];
  const secure = baseURL.startsWith("https://");
  const testMode = Boolean(env.TEST_MODE);
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            prompt: "select_account" as const,
          },
        }
      : {};

  return betterAuth({
    appName: lang === "es" ? "Mi Cita en Tiempo" : "My Appointment On Time",
    baseURL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [baseURL],
    database: drizzleAdapter(db, { provider: "pg", schema, usePlural: false }),
    advanced: {
      useSecureCookies: secure,
      cookiePrefix: "mcet",
      database: { generateId: () => uuidv7() },
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
    },
    user: {
      additionalFields: {
        locale: { type: "string", required: false, defaultValue: lang, input: true },
        timezone: { type: "string", required: false, defaultValue: "UTC", input: true },
        timeFormat: {
          type: "string",
          required: false,
          defaultValue: lang === "es" ? "24h" : "12h",
          input: true,
        },
        weekStart: { type: "number", required: false, defaultValue: lang === "es" ? 1 : 7, input: true },
        country: { type: "string", required: false, input: true },
      },
      deleteUser: { enabled: true },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      password: { hash: hashPassword, verify: verifyPassword },
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const l = userLang(user as { locale?: unknown }, lang);
        await mail.send({
          lang: l,
          to: user.email,
          ...(await resetPasswordEmail(l, { name: user.name, url })),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        const l = userLang(user as { locale?: unknown }, lang);
        await mail.send({ lang: l, to: user.email, ...(await verifyEmail(l, { name: user.name, url })) });
      },
    },
    socialProviders: google,
    rateLimit: {
      enabled: !testMode,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60 * 60, max: 5 },
        "/email-otp/send-verification-otp": { window: 60 * 60, max: 5 },
        "/forget-password": { window: 60 * 60, max: 5 },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ALTCHA_PATHS.has(ctx.path) && !(await verifyAltcha(ctx.headers?.get("x-altcha") ?? undefined))) {
          throw new APIError("FORBIDDEN", { code: "ALTCHA_REQUIRED", message: ALTCHA_MESSAGE[lang] });
        }
        if (!EMAIL_PATHS.has(ctx.path)) return;
        const body = ctx.body as { email?: unknown } | undefined;
        if (typeof body?.email !== "string") return;
        const check = await checkEmail(body.email, { skipDns: testMode });
        if (!check.ok && check.problem) {
          throw new APIError("BAD_REQUEST", {
            code: check.problem.toUpperCase(),
            message: EMAIL_ERRORS[lang][check.problem],
          });
        }
        body.email = check.normalized;
      }),
    },
    plugins: [
      bearer(),
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 5,
        sendVerificationOTP: async ({ email, otp }) => {
          await mail.send({ lang, to: email, ...(await otpEmail(lang, { code: otp })) });
        },
      }),
      twoFactor({ issuer: lang === "es" ? "Mi Cita en Tiempo" : "My Appointment On Time" }),
      // Contraseñas filtradas (k-anonimato: solo viajan 5 caracteres del SHA-1). Sin red en pruebas.
      ...(testMode ? [] : [haveIBeenPwned({ customPasswordCompromisedMessage: PWNED_MESSAGE[lang] })]),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
