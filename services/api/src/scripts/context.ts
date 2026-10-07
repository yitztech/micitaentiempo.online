import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";

/** Contexto de la aplicación para scripts de operación (sin servidor HTTP). */
export async function appContext() {
  return NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
}
