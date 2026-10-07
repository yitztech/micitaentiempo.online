import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { CurrentUser } from "../auth/auth.guard.js";
import type { SessionUser } from "../auth/auth.registry.js";
import { requestLang } from "../common/request.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { MCP_SCOPES } from "./mcp.config.js";
import { McpService } from "./mcp.service.js";

const ClientId = z.string().min(1).max(512);
const Grant = z
  .object({
    clientId: ClientId,
    calendarIds: z.array(z.string().min(1).max(64)).max(50),
    scopes: z.array(z.enum(MCP_SCOPES)).max(MCP_SCOPES.length).default([]),
  })
  .strict();
const StaticClient = z.object({ name: z.string().trim().min(1).max(80) }).strict();

/** Panel → IA y pantalla de consentimiento (docs/plan/06-mcp.md §6.2 y §6.5). */
@Controller("v1/ai")
export class McpController {
  constructor(
    private readonly mcp: McpService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get("connections")
  connections(@CurrentUser() user: SessionUser) {
    return this.mcp.connections(user);
  }

  @Delete("connections/:clientId")
  @HttpCode(204)
  async revoke(@CurrentUser() user: SessionUser, @Param("clientId", new ZodPipe(ClientId)) clientId: string) {
    await this.mcp.revoke(user, clientId);
  }

  /** Aplicación que pide acceso (nombre, dominio y si el dominio está verificado por CIMD). */
  @Get("clients/:clientId")
  client(@Param("clientId", new ZodPipe(ClientId)) clientId: string) {
    return this.mcp.clientInfo(clientId);
  }

  /** Tableros elegidos en el consentimiento; se guarda justo antes de aceptar. */
  @Put("grants")
  grant(
    @CurrentUser() user: SessionUser,
    @Req() req: FastifyRequest,
    @Body(new ZodPipe(Grant)) body: z.infer<typeof Grant>,
  ) {
    return this.mcp.saveGrant(user, requestLang(req, this.env), body.clientId, body.calendarIds, body.scopes);
  }

  @Get("static-clients")
  staticClients(@CurrentUser() user: SessionUser) {
    return this.mcp.staticClients(user);
  }

  @Post("static-clients")
  createStatic(
    @CurrentUser() user: SessionUser,
    @Req() req: FastifyRequest,
    @Body(new ZodPipe(StaticClient)) body: z.infer<typeof StaticClient>,
  ) {
    return this.mcp.createStaticClient(user, requestLang(req, this.env), body.name);
  }

  @Delete("static-clients/:clientId")
  @HttpCode(204)
  async deleteStatic(
    @CurrentUser() user: SessionUser,
    @Param("clientId", new ZodPipe(ClientId)) clientId: string,
  ) {
    await this.mcp.deleteStaticClient(user, clientId);
  }
}
