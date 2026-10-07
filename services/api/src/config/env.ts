import { siteConfigFromEnv } from "@mcet/i18n";
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v : undefined));

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().default(3000),
  INTERNAL_PORT: z.coerce.number().int().default(3001),
  RELEASE_SHA: z.string().default("dev"),
  IDIOMAS: z.string().default("es,en"),
  SITE_URL: z.url(),
  SITE_URL_ES: optional,
  SITE_URL_EN: z.url(),
  HOST_LANG_MAP: optional,
  DB_HOST: z.string().default("postgres"),
  DB_PORT: z.coerce.number().int().default(5432),
  DB_NAME: z.string().default("micita"),
  DB_USER: z.string().default("api"),
  DB_PASSWORD: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().default(15),
  CALENDAR_RPC_URL: z.url().default("http://calendar:8081"),
  RPC_SECRET_API_TO_CALENDAR: z.string().min(32, "debe tener al menos 32 caracteres"),
  RPC_SECRET_CALENDAR_TO_API: z.string().min(32, "debe tener al menos 32 caracteres"),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int(),
  SMTP_SECURE: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),
  SMTP_USER: z.string().min(1),
  SMTP_PASSWORD: z.string().min(1),
  MAIL_FROM: z.string().min(3),
  SMTP_USER_ES: optional,
  SMTP_PASSWORD_ES: optional,
  MAIL_FROM_ES: optional,
  SMTP_USER_EN: z.string().min(1),
  SMTP_PASSWORD_EN: z.string().min(1),
  MAIL_FROM_EN: z.string().min(3),
  BETTER_AUTH_SECRET: z.string().min(32, "debe tener al menos 32 caracteres"),
  APP_ENC_KEY: z.string().min(32, "debe tener al menos 32 caracteres"),
  ALTCHA_HMAC_KEY: z.string().min(32, "debe tener al menos 32 caracteres"),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  // Integraciones opcionales: sin valor, la función queda desactivada (05-negocio-api.md §5.9).
  MS_CLIENT_ID: optional,
  MS_CLIENT_SECRET: optional,
  STRIPE_SECRET_KEY: optional,
  SLACK_CLIENT_ID: optional,
  TELEGRAM_BOT_TOKEN: optional,
  WHATSAPP_TOKEN: optional,
  WHATSAPP_PHONE_NUMBER_ID: optional,
  SLACK_CLIENT_SECRET: optional,
  TELEGRAM_BOT_USERNAME: optional,
  TELEGRAM_WEBHOOK_SECRET: optional,
  WHATSAPP_APP_SECRET: optional,
  // Bases de las API externas: configurables para probar contra el servidor de captura.
  TELEGRAM_API_URL: z.url().default("https://api.telegram.org"),
  SLACK_API_URL: z.url().default("https://slack.com/api"),
  SLACK_AUTHORIZE_URL: z.url().default("https://slack.com/oauth/v2/authorize"),
  WHATSAPP_API_URL: z.url().default("https://graph.facebook.com/v24.0"),
  LISTMONK_URL: optional,
  LISTMONK_LIST_UUID: optional,
  LISTMONK_URL_EN: optional,
  LISTMONK_LIST_UUID_EN: optional,
  TEST_MODE: optional,
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = z.infer<typeof EnvSchema> & { site: ReturnType<typeof siteConfigFromEnv> };

/** Hosts reales: TEST_MODE nunca puede activarse contra ellos. */
const PRODUCTION_HOSTS = ["micitaentiempo.online", "myappointmentontime.online"];

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuración inválida: ${issues}`);
  }
  const env = parsed.data;
  const site = siteConfigFromEnv(source);
  if (env.TEST_MODE) {
    const real = [...site.hosts.keys()].some((h) =>
      PRODUCTION_HOSTS.some((p) => h === p || h.endsWith(`.${p}`)),
    );
    if (real) throw new Error("TEST_MODE está prohibido con dominios reales");
  }
  return { ...env, site };
}
