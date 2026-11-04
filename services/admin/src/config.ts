import { resolve } from "node:path";

export interface AdminConfig {
  port: number;
  host: string;
  dataDir: string;
  publicDir: string;
  sqliteFile: string;
  initialAdminUser: string;
  initialAdminPassword: string;
  releaseSha: string;
  pg: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
}

export function loadConfig(): AdminConfig {
  const initialAdminUser = requiredInitialAdminCredential("ADMIN_INITIAL_USER");
  const initialAdminPassword = requiredInitialAdminCredential("ADMIN_INITIAL_PASSWORD");
  if (initialAdminUser !== initialAdminUser.trim().toLowerCase()) {
    throw new Error("ADMIN_INITIAL_USER debe estar en minúsculas y sin espacios al inicio o al final");
  }
  if (Array.from(initialAdminUser).length > 100) {
    throw new Error("ADMIN_INITIAL_USER no puede superar 100 caracteres");
  }
  if (Array.from(initialAdminPassword).length > 128) {
    throw new Error("ADMIN_INITIAL_PASSWORD no puede superar 128 caracteres");
  }

  const dbHost = process.env.DB_HOST || "";
  const dbPassword = process.env.DB_PASSWORD || process.env.API_DB_PASSWORD || "";
  if (dbHost && !dbPassword) throw new Error("DB_PASSWORD es obligatoria cuando se define DB_HOST");

  const dataDir = process.env.ADMIN_DATA_DIR || resolve(process.cwd(), "data");
  return {
    port: Number(process.env.ADMIN_PORT || process.env.PORT || 3000),
    host: process.env.ADMIN_HOST || "0.0.0.0",
    dataDir,
    publicDir: process.env.ADMIN_PUBLIC_DIR || resolve(process.cwd(), "public"),
    sqliteFile: process.env.ADMIN_SQLITE_FILE || resolve(dataDir, "admin.sqlite"),
    initialAdminUser,
    initialAdminPassword,
    releaseSha: process.env.RELEASE_SHA || "dev",
    pg: {
      host: dbHost,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || "micita",
      user: process.env.DB_USER || "api",
      password: dbPassword,
    },
  };
}

function requiredInitialAdminCredential(name: "ADMIN_INITIAL_USER" | "ADMIN_INITIAL_PASSWORD"): string {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`${name} es obligatoria para iniciar el panel de administración`);
  }
  return value;
}
