import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import type { Conflict, Event } from "@mcet/contracts/mcet/calendar/v1/events_pb";

export const iso = (t: Timestamp | undefined) => (t ? timestampDate(t).toISOString() : null);

/** Evento tal como lo ve el personal del negocio. */
export function eventView(e: Event) {
  return {
    id: e.id,
    calendarId: e.calendarId,
    kind: e.kind,
    status: e.status,
    start: iso(e.start),
    end: iso(e.end),
    seat: e.seat,
    serviceId: e.serviceId || null,
    title: e.title || null,
    customerUserId: e.customerUserId || null,
    attendee:
      e.attendee?.name || e.attendee?.email
        ? {
            name: e.attendee.name || null,
            email: e.attendee.email || null,
            phone: e.attendee.phone || null,
            timezone: e.attendee.timezone || null,
          }
        : null,
    customerNotes: e.customerNotes || null,
    internalNotes: e.internalNotes || null,
    attendance: e.attendance || null,
    createdVia: e.createdVia,
    holdExpiresAt: iso(e.holdExpiresAt),
    version: e.version,
    recurrence: e.recurrence
      ? {
          seriesId: e.recurrence.seriesId,
          rrule: e.recurrence.rrule || null,
          recurrenceId: e.recurrence.recurrenceId,
          isException: e.recurrence.isException,
        }
      : null,
    cancelledAt: iso(e.cancelledAt),
    cancelReason: e.cancelReason || null,
  };
}

/** Cita tal como la ve el cliente final (nunca notas internas ni datos de otros). */
export function bookingView(e: Event) {
  return {
    id: e.id,
    calendarId: e.calendarId,
    status: e.status,
    start: iso(e.start),
    end: iso(e.end),
    serviceId: e.serviceId || null,
    name: e.attendee?.name || null,
    notes: e.customerNotes || null,
    holdExpiresAt: iso(e.holdExpiresAt),
    version: e.version,
  };
}

export const conflictView = (c: Conflict) => ({ start: iso(c.start), reason: c.reason });
