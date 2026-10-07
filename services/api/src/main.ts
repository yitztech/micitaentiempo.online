import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import { ProblemFilter } from "./common/problem.filter.js";
import { loadEnv } from "./config/env.js";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  // trustProxy = 1: el gateway sobrescribe X-Forwarded-For con un único valor.
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: (_address, hop) => hop < 1, bodyLimit: 256 * 1024 }),
    // rawBody: la firma de los webhooks de Stripe se verifica sobre el cuerpo tal cual llegó.
    { bufferLogs: true, rawBody: true },
  );
  app.useLogger(app.get(Logger));
  // Respuestas con datos de cuenta: sin caché salvo que la ruta diga otra cosa (metadatos públicos).
  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onSend", async (_req, reply, payload) => {
      if (!reply.hasHeader("cache-control")) reply.header("cache-control", "no-store");
      return payload;
    });
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();
  await app.listen(env.PORT, "0.0.0.0");
}

void bootstrap();
