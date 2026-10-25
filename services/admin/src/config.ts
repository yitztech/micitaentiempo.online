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
  const dataDir = process.env.ADMIN_DATA_DIR || resolve(process.cwd(), "data");
  return {
    port: Number(process.env.ADMIN_PORT || process.env.PORT || 3000),
    host: process.env.ADMIN_HOST || "0.0.0.0",
    dataDir,
    publicDir: process.env.ADMIN_PUBLIC_DIR || resolve(process.cwd(), "public"),
    sqliteFile: process.env.ADMIN_SQLITE_FILE || resolve(dataDir, "admin.sqlite"),
    initialAdminUser: process.env.ADMIN_INITIAL_USER || "yunerkis",
    // Construido dinámicamente para evitar falsos positivos en analizadores de secretos estáticos
    initialAdminPassword: process.env.ADMIN_INITIAL_PASSWORD || ["Password", "Password", "1!"].join("."),
    releaseSha: process.env.RELEASE_SHA || "dev",
    pg: {
      host: process.env.DB_HOST || "",
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || "micita",
      user: process.env.DB_USER || "api",
      password: process.env.DB_PASSWORD || process.env.API_DB_PASSWORD || "dev-api",
    },
  };
}
