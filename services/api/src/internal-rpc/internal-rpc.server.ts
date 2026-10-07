import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import { fastifyConnectPlugin } from "@connectrpc/connect-fastify";
import { EventIngressService as EventIngressDesc } from "@mcet/contracts/mcet/api/v1/event_ingress_pb";
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { type FastifyInstance, fastify } from "fastify";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { EventIngressService } from "./event-ingress.service.js";
import { AUDIENCE_API, ISSUER_CALENDAR, verifyInternal } from "./jwt.js";

/** Servidor RPC interno (puerto 3001): el gateway no lo enruta y además exige el JWT del motor. */
export function internalAuth(secret: string): Interceptor {
  return (next) => async (req) => {
    const token = req.header.get("authorization")?.replace(/^Bearer /, "");
    if (!token) throw new ConnectError("falta el token interno", Code.Unauthenticated);
    try {
      await verifyInternal(secret, token, { issuer: ISSUER_CALENDAR, audience: AUDIENCE_API });
    } catch (err) {
      throw new ConnectError(`token interno no válido: ${(err as Error).message}`, Code.Unauthenticated);
    }
    return next(req);
  };
}

export async function buildInternalServer(
  secret: string,
  ingress: EventIngressService,
): Promise<FastifyInstance> {
  const server = fastify({ logger: false });
  await server.register(fastifyConnectPlugin, {
    interceptors: [internalAuth(secret)],
    routes: (router) =>
      router.service(EventIngressDesc, {
        async publish(req) {
          if (!req.event) throw new ConnectError("falta el evento", Code.InvalidArgument);
          return { duplicate: await ingress.publish(req.event) };
        },
      }),
  });
  server.get("/readyz", async () => ({ status: "ready" }));
  return server;
}

@Injectable()
export class InternalRpcServer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(InternalRpcServer.name);
  private server?: FastifyInstance;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly ingress: EventIngressService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.server = await buildInternalServer(this.env.RPC_SECRET_CALENDAR_TO_API, this.ingress);
    await this.server.listen({ host: "0.0.0.0", port: this.env.INTERNAL_PORT });
    this.logger.log(`RPC interno escuchando en :${this.env.INTERNAL_PORT}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.server?.close();
  }
}
