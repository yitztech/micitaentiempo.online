import { create } from "@bufbuild/protobuf";
import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { AvailabilityService } from "@mcet/contracts/mcet/calendar/v1/availability_pb";
import { type Schedule, ScheduleService } from "@mcet/contracts/mcet/calendar/v1/schedule_pb";
import {
  type Service as RpcService,
  ServiceCatalogService,
  ServiceSchema,
} from "@mcet/contracts/mcet/calendar/v1/services_pb";
import {
  AvailabilityQuery,
  CreateCalendar,
  CustomHoliday,
  DateOverride,
  HolidayPolicies,
  HolidayRange,
  Service,
  ServiceOrder,
  UpdateCalendar,
  WeeklyHours,
} from "@mcet/schemas";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth/auth.guard.js";
import type { SessionUser } from "../auth/auth.registry.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { asActor, type CalendarClients } from "../internal-rpc/calendar-client.js";
import { CALENDAR } from "../internal-rpc/internal-rpc.module.js";
import { CalendarAccess } from "./access.service.js";
import { CalendarsService } from "./calendars.service.js";
import { rpc } from "./rpc-errors.js";

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Archive = z.object({ archived: z.boolean() }).strict();

function scheduleView(s: Schedule) {
  return {
    shifts: s.shifts.map((x) => ({
      weekday: x.weekday,
      kind: x.kind,
      range: { start: x.range?.start, end: x.range?.end },
      label: x.label || undefined,
    })),
    overrides: s.overrides.map((o) => ({
      date: o.date,
      kind: o.kind,
      intervals: o.intervals.map((r) => ({ start: r.start, end: r.end })),
      note: o.note || undefined,
    })),
    holidayPolicies: s.holidayPolicies.map((p) => ({
      country: p.country,
      subdivision: p.subdivision || undefined,
      types: p.types,
      substitutes: p.substitutes,
    })),
    customHolidays: s.customHolidays.map((c) => ({
      id: c.id,
      name: c.name,
      date: c.date || undefined,
      monthDay: c.monthDay || undefined,
    })),
  };
}

function serviceView(s: RpcService) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    durationMin: s.durationMin,
    bufferBeforeMin: s.bufferBeforeMin,
    bufferAfterMin: s.bufferAfterMin,
    minNoticeMin: s.minNoticeMin,
    maxAdvanceDays: s.maxAdvanceDays,
    slotStepMin: s.slotStepMin,
    dailyLimit: s.dailyLimit,
    color: s.color,
    active: s.active,
    position: s.position,
  };
}

@Controller("v1/calendars")
export class CalendarsController {
  constructor(
    private readonly calendars: CalendarsService,
    private readonly access: CalendarAccess,
    @Inject(CALENDAR) private readonly rpcClients: CalendarClients,
  ) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.calendars.list(user);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body(new ZodPipe(CreateCalendar)) body: CreateCalendar) {
    return this.calendars.create(user, body);
  }

  @Get(":id")
  get(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.calendars.get(user, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodPipe(UpdateCalendar)) body: UpdateCalendar,
  ) {
    return this.calendars.update(user, id, body);
  }

  @Post(":id/archive")
  @HttpCode(200)
  archive(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodPipe(Archive)) body: z.infer<typeof Archive>,
  ) {
    return this.calendars.archive(user, id, body.archived);
  }

  // ── Horario, excepciones y feriados ──

  private async scheduleCall(user: SessionUser, id: string, write: boolean) {
    const m = await this.access.require(user, id, write ? "settings.write" : "slots.read");
    return {
      client: this.rpcClients.client(ScheduleService),
      opts: asActor({ actor: this.access.actor(user, m) }),
    };
  }

  @Get(":id/schedule")
  async schedule(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    const { client, opts } = await this.scheduleCall(user, id, false);
    return scheduleView(await rpc(client.getSchedule({ calendarId: id }, opts)));
  }

  @Put(":id/hours")
  async setHours(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodPipe(WeeklyHours)) body: WeeklyHours,
  ) {
    const { client, opts } = await this.scheduleCall(user, id, true);
    return scheduleView(
      await rpc(
        client.setWeeklyHours(
          {
            calendarId: id,
            shifts: body.shifts.map((s) => ({
              weekday: s.weekday,
              kind: s.kind,
              range: s.range,
              label: s.label ?? "",
            })),
          },
          opts,
        ),
      ),
    );
  }

  @Put(":id/overrides/:date")
  async upsertOverride(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Param("date", new ZodPipe(IsoDate)) date: string,
    @Body(new ZodPipe(DateOverride)) body: DateOverride,
  ) {
    const { client, opts } = await this.scheduleCall(user, id, true);
    return scheduleView(
      await rpc(
        client.upsertDateOverride(
          {
            calendarId: id,
            override: { date, kind: body.kind, intervals: body.intervals, note: body.note ?? "" },
          },
          opts,
        ),
      ),
    );
  }

  @Delete(":id/overrides/:date")
  async deleteOverride(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Param("date", new ZodPipe(IsoDate)) date: string,
  ) {
    const { client, opts } = await this.scheduleCall(user, id, true);
    return scheduleView(await rpc(client.deleteDateOverride({ calendarId: id, date }, opts)));
  }

  @Put(":id/holidays")
  async setHolidayPolicies(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodPipe(HolidayPolicies)) body: HolidayPolicies,
  ) {
    const { client, opts } = await this.scheduleCall(user, id, true);
    return scheduleView(
      await rpc(
        client.setHolidayPolicies(
          {
            calendarId: id,
            policies: body.policies.map((p) => ({
              country: p.country,
              subdivision: p.subdivision ?? "",
              types: p.types,
              substitutes: p.substitutes,
            })),
          },
          opts,
        ),
      ),
    );
  }

  @Post(":id/holidays/custom")
  async addCustomHoliday(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodPipe(CustomHoliday)) body: CustomHoliday,
  ) {
    const { client, opts } = await this.scheduleCall(user, id, true);
    return scheduleView(
      await rpc(
        client.upsertCustomHoliday(
          {
            calendarId: id,
            holiday: { name: body.name, date: body.date ?? "", monthDay: body.monthDay ?? "" },
          },
          opts,
        ),
      ),
    );
  }

  @Delete(":id/holidays/custom/:holidayId")
  async deleteCustomHoliday(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Param("holidayId") holidayId: string,
  ) {
    const { client, opts } = await this.scheduleCall(user, id, true);
    return scheduleView(await rpc(client.deleteCustomHoliday({ calendarId: id, id: holidayId }, opts)));
  }

  @Get(":id/holidays")
  async holidays(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Query(new ZodPipe(HolidayRange)) q: z.infer<typeof HolidayRange>,
  ) {
    const { client, opts } = await this.scheduleCall(user, id, false);
    const res = await rpc(
      client.listHolidays({ calendarId: id, from: q.from, to: q.to, locale: user.locale }, opts),
    );
    return res.holidays.map((h) => ({
      date: h.date,
      name: h.name,
      source: h.source,
      type: h.type,
      open: h.open,
    }));
  }

  // ── Servicios ──

  private async servicesCall(user: SessionUser, id: string, write: boolean) {
    const m = await this.access.require(user, id, write ? "settings.write" : "slots.read");
    return {
      client: this.rpcClients.client(ServiceCatalogService),
      opts: asActor({ actor: this.access.actor(user, m) }),
    };
  }

  @Get(":id/services")
  async services(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    const { client, opts } = await this.servicesCall(user, id, false);
    return (await rpc(client.listServices({ calendarId: id, includeInactive: true }, opts))).services.map(
      serviceView,
    );
  }

  private toRpc(id: string, body: Service, serviceId = "") {
    return create(ServiceSchema, {
      id: serviceId,
      calendarId: id,
      name: Object.fromEntries(Object.entries(body.name).filter(([, v]) => v)),
      description: Object.fromEntries(Object.entries(body.description).filter(([, v]) => v)),
      durationMin: body.durationMin,
      bufferBeforeMin: body.bufferBeforeMin,
      bufferAfterMin: body.bufferAfterMin,
      minNoticeMin: body.minNoticeMin,
      maxAdvanceDays: body.maxAdvanceDays,
      slotStepMin: body.slotStepMin,
      dailyLimit: body.dailyLimit,
      color: body.color,
      active: body.active,
    });
  }

  @Post(":id/services")
  async createService(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodPipe(Service)) body: Service,
  ) {
    const { client, opts } = await this.servicesCall(user, id, true);
    return serviceView(await rpc(client.createService({ service: this.toRpc(id, body) }, opts)));
  }

  @Put(":id/services/:serviceId")
  async updateService(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Param("serviceId") serviceId: string,
    @Body(new ZodPipe(Service)) body: Service,
  ) {
    const { client, opts } = await this.servicesCall(user, id, true);
    return serviceView(await rpc(client.updateService({ service: this.toRpc(id, body, serviceId) }, opts)));
  }

  @Delete(":id/services/:serviceId")
  @HttpCode(204)
  async deleteService(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Param("serviceId") serviceId: string,
  ) {
    const { client, opts } = await this.servicesCall(user, id, true);
    await rpc(client.deleteService({ calendarId: id, id: serviceId }, opts));
  }

  @Put(":id/services-order")
  async reorder(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodPipe(ServiceOrder)) body: z.infer<typeof ServiceOrder>,
  ) {
    const { client, opts } = await this.servicesCall(user, id, true);
    return (await rpc(client.reorderServices({ calendarId: id, ids: body.ids }, opts))).services.map(
      serviceView,
    );
  }

  // ── Disponibilidad ──

  @Get(":id/availability")
  async availability(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Query(new ZodPipe(AvailabilityQuery)) q: AvailabilityQuery,
  ) {
    const m = await this.access.require(user, id, "slots.read");
    const res = await rpc(
      this.rpcClients.client(AvailabilityService).getSlots(
        {
          calendarId: id,
          serviceId: q.service,
          from: timestampFromDate(new Date(q.from)),
          to: timestampFromDate(new Date(q.to)),
        },
        asActor({ actor: this.access.actor(user, m) }),
      ),
    );
    return {
      timezone: res.timezone,
      slots: res.slots.map((s) => ({
        start: s.start ? timestampDate(s.start).toISOString() : null,
        end: s.end ? timestampDate(s.end).toISOString() : null,
        seatsFree: s.seatsFree,
      })),
    };
  }
}

@Controller("v1/holidays")
export class HolidayCatalogController {
  private readonly cache = new Map<string, unknown>();

  constructor(@Inject(CALENDAR) private readonly rpcClients: CalendarClients) {}

  /** Países y regiones con datos de feriados, en el idioma del usuario. */
  @Get("countries")
  async countries(@CurrentUser() user: SessionUser) {
    const hit = this.cache.get(user.locale);
    if (hit) return hit;
    const res = await rpc(
      this.rpcClients
        .client(ScheduleService)
        .listCountries(
          { locale: user.locale },
          asActor({ actor: { sub: user.id, role: "system", via: "panel" } }),
        ),
    );
    const view = {
      years: res.years,
      countries: res.countries.map((c) => ({
        code: c.code,
        name: c.name,
        subdivisions: c.subdivisions.map((s) => ({ code: s.code, name: s.name })),
      })),
    };
    this.cache.set(user.locale, view);
    return view;
  }
}
