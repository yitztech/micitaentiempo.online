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
