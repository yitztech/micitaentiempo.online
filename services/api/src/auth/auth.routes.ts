import { Injectable, type OnModuleInit } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { toHeaders } from "../common/request.js";
import { AuthRegistry } from "./auth.registry.js";

/** Monta Better Auth en /api/auth/* de Fastify, con la instancia del dominio de la petición. */
@Injectable()
export class AuthRoutes implements OnModuleInit {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly registry: AuthRegistry,
  ) {}

  onModuleInit(): void {
    const fastify = this.adapterHost.httpAdapter.getInstance<FastifyInstance>();
    fastify.route({
      method: ["GET", "POST"],
      url: "/api/auth/*",
      handler: (req, reply) => this.handle(req, reply),
    });
  }

  private async handle(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
    const url = new URL(req.url, `${proto}://${req.headers.host}`);
    const headers = toHeaders(req.headers);
    let body: string | undefined;
    if (req.method !== "GET" && req.body !== undefined && req.body !== null) {
      const type = headers.get("content-type") ?? "";
      body = type.includes("application/x-www-form-urlencoded")
        ? new URLSearchParams(req.body as Record<string, string>).toString()
        : JSON.stringify(req.body);
    }
    const response = await this.registry
      .forRequest(req)
      .handler(new Request(url, { method: req.method, headers, body }));
    reply.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "set-cookie") reply.header(key, value);
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) reply.header("set-cookie", cookies);
    reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
  }
}
