import { CalendarService } from "@mcet/contracts/mcet/calendar/v1/calendar_pb";
import { Plan } from "@mcet/schemas";
import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { CurrentUser, Public } from "../auth/auth.guard.js";
import type { SessionUser } from "../auth/auth.registry.js";
import { requestLang } from "../common/request.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { asActor, type CalendarClients } from "../internal-rpc/calendar-client.js";
import { CALENDAR } from "../internal-rpc/internal-rpc.module.js";
import { BillingService } from "./billing.service.js";

const PlanBody = z.object({ plan: Plan }).strict();

/** Facturación del propietario (05-negocio-api.md §5.5). Sin Stripe: solo lectura y cambio de plan. */
@Controller("v1/billing")
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    @Inject(ENV) private readonly env: Env,
    @Inject(CALENDAR) private readonly rpc: CalendarClients,
  ) {}

  @Get()
  async get(@CurrentUser() user: SessionUser) {
    return this.billing.view(await this.billing.orgOf(user.id));
  }

  @Post("checkout")
  async checkout(
    @CurrentUser() user: SessionUser,
    @Req() req: FastifyRequest,
    @Body(new ZodPipe(PlanBody)) body: z.infer<typeof PlanBody>,
  ) {
    return this.billing.checkout(user.id, body.plan, requestLang(req, this.env));
  }

  @Post("change-plan")
  async changePlan(
    @CurrentUser() user: SessionUser,
    @Body(new ZodPipe(PlanBody)) body: z.infer<typeof PlanBody>,
  ) {
    const org = await this.billing.orgOf(user.id);
    const res = await this.rpc
      .client(CalendarService)
      .listCalendars(
        { orgId: org.id },
        asActor({ actor: { sub: user.id, org: org.id, role: "owner", via: "panel" } }),
      );
    const active = res.calendars.filter((c) => c.status === "active").length;
    return this.billing.changePlan(user.id, body.plan, active);
  }

  @Post("cancel")
  async cancel(@CurrentUser() user: SessionUser) {
    return this.billing.setCancel(user.id, true);
  }

  @Post("resume")
  async resume(@CurrentUser() user: SessionUser) {
    return this.billing.setCancel(user.id, false);
  }

  @Post("setup-intent")
  async setupIntent(@CurrentUser() user: SessionUser) {
    return this.billing.setupIntent(user.id);
  }

  @Get("invoices")
  async invoices(@CurrentUser() user: SessionUser) {
    return this.billing.invoices(user.id);
  }
}

/** Webhook de Stripe: firma sobre el cuerpo crudo; idempotente por id de evento. */
@Public()
@Controller("webhooks")
export class StripeWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post("stripe")
  @HttpCode(200)
  async stripe(@Req() req: FastifyRequest & { rawBody?: Buffer }) {
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string" || !req.rawBody)
      throw new BadRequestException({ code: "invalid_signature", message: "Firma ausente" });
    try {
      return await this.billing.handleWebhook(req.rawBody, signature);
    } catch (err) {
      if ((err as { type?: string }).type === "StripeSignatureVerificationError") {
        throw new BadRequestException({ code: "invalid_signature", message: "Firma no válida" });
      }
      throw err;
    }
  }
}
