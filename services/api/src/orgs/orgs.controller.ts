import { CreateOrg, UpdateOrg } from "@mcet/schemas";
import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/auth.guard.js";
import type { SessionUser } from "../auth/auth.registry.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { type Organization, OrgsService } from "./orgs.service.js";

function view(org: Organization, limits: ReturnType<OrgsService["limits"]>) {
  return {
    id: org.id,
    name: org.name,
    plan: org.plan,
    status: org.status,
    trialEndsAt: org.trialEndsAt?.toISOString() ?? null,
    country: org.country,
    limits,
  };
}

@Controller("v1/org")
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Get()
  async get(@CurrentUser() user: SessionUser) {
    const org = await this.orgs.requireByOwner(user.id);
    return view(org, this.orgs.limits(org));
  }

  @Post()
  async create(@CurrentUser() user: SessionUser, @Body(new ZodPipe(CreateOrg)) body: CreateOrg) {
    const org = await this.orgs.create(user.id, body);
    return view(org, this.orgs.limits(org));
  }

  @Patch()
  async update(@CurrentUser() user: SessionUser, @Body(new ZodPipe(UpdateOrg)) body: UpdateOrg) {
    const org = await this.orgs.update(user.id, body);
    return view(org, this.orgs.limits(org));
  }
}
