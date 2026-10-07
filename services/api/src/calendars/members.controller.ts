import { Invitation } from "@mcet/schemas";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { type AuthedRequest, CurrentUser, Public } from "../auth/auth.guard.js";
import type { SessionUser } from "../auth/auth.registry.js";
import { requestLang } from "../common/request.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { MembersService } from "./members.service.js";

@Controller()
export class MembersController {
  constructor(
    private readonly members: MembersService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get("v1/calendars/:id/members")
  list(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.members.list(user, id);
  }

  @Post("v1/calendars/:id/invitations")
  invite(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodPipe(Invitation)) body: Invitation,
    @Req() req: AuthedRequest,
  ) {
    return this.members.invite(user, id, body, requestLang(req, this.env));
  }

  @Delete("v1/calendars/:id/invitations/:invitationId")
  @HttpCode(204)
  async revoke(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Param("invitationId") invitationId: string,
  ) {
    await this.members.revoke(user, id, invitationId);
  }

  @Delete("v1/calendars/:id/members/:userId")
  @HttpCode(204)
  async remove(@CurrentUser() user: SessionUser, @Param("id") id: string, @Param("userId") memberId: string) {
    await this.members.remove(user, id, memberId);
  }

  @Public()
  @Get("public/v1/invitations/:token")
  preview(@Param("token") token: string) {
    return this.members.preview(token);
  }

  @Post("v1/invitations/:token/accept")
  @HttpCode(200)
  accept(@CurrentUser() user: SessionUser, @Param("token") token: string) {
    return this.members.accept(user, token);
  }
}
