package engine

import (
	"context"
	"errors"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	calendarv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/calendar/v1"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/auth"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/availability"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/store"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// EventServer implementa mcet.calendar.v1.EventService.
type EventServer struct{ *Engine }

// Límites de entrada.
const (
	maxHoldsPerHolder = 3
	maxNotes          = 2000
	maxTitle          = 200
	maxListWindow     = 400 * 24 * time.Hour
	maxAppointment    = 24 * time.Hour
	maxBlock          = 62 * 24 * time.Hour
)

// errRollback deshace la transacción sin error para el cliente (p. ej., conflictos de una serie con "abort").
var errRollback = errors.New("rollback")

func newEventID() string { return uuid.Must(uuid.NewV7()).String() }

func i32(n int) int32 { return int32(n) } //nolint:gosec // asientos, versiones y conteos pequeños

func ts(t *time.Time) *timestamppb.Timestamp {
	if t == nil {
		return nil
	}
	return timestamppb.New(*t)
}

func validID(id string) error {
	if _, err := uuid.Parse(id); err != nil {
		return fail(connect.CodeNotFound, "event_not_found", "evento")
	}
	return nil
}

func attendeeOf(p *calendarv1.Attendee) store.Attendee {
	return store.Attendee{Name: p.GetName(), Email: p.GetEmail(), Phone: p.GetPhone(), Locale: p.GetLocale(), Timezone: p.GetTimezone()}
}

// toProto convierte un evento; a un cliente final no se le muestran notas internas ni datos del personal.
func toProto(ev store.Event, forCustomer bool) *calendarv1.Event {
	p := &calendarv1.Event{
		Id: ev.ID, CalendarId: ev.CalendarID, Kind: ev.Kind, Status: ev.Status,
		Start: timestamppb.New(ev.Start), End: timestamppb.New(ev.End), AllDay: ev.AllDay, Seat: i32(ev.Seat),
		ServiceId: ev.ServiceID, Title: ev.Title, CustomerUserId: ev.CustomerUserID,
		Attendee: &calendarv1.Attendee{Name: ev.Attendee.Name, Email: ev.Attendee.Email, Phone: ev.Attendee.Phone,
			Locale: ev.Attendee.Locale, Timezone: ev.Attendee.Timezone},
		CustomerNotes: ev.CustomerNotes, InternalNotes: ev.InternalNotes, Attendance: ev.Attendance,
		CreatedBy: ev.CreatedBy, CreatedVia: ev.CreatedVia, HoldExpiresAt: ts(ev.HoldExpiresAt),
		Version: i32(ev.Version), CreatedAt: timestamppb.New(ev.CreatedAt), CancelledAt: ts(ev.CancelledAt),
		CancelReason: ev.CancelReason, IcalUid: ev.ICalUID, IcalSequence: i32(ev.ICalSequence),
	}
	if ev.SeriesID != "" && ev.RecurrenceID != nil {
		p.Recurrence = &calendarv1.Recurrence{SeriesId: ev.SeriesID, RecurrenceId: ev.RecurrenceID.UTC().Format(localLayout),
			IsException: ev.IsException}
	}
	if forCustomer {
		p.InternalNotes, p.CreatedBy, p.Seat, p.Attendance = "", "", 0, ""
	}
	return p
}

// expiredHold indica un hold que ya no aparta nada (antes de que lo limpie el job).
func expiredHold(ev store.Event, now time.Time) bool {
	return ev.Status == "held" && ev.HoldExpiresAt != nil && !ev.HoldExpiresAt.After(now)
}

// load devuelve un evento visible para el actor; si no lo es, responde «no existe» (no filtra existencia).
func (s EventServer) load(ctx context.Context, id string) (store.Event, store.Calendar, auth.ActorClaims, error) {
	a, err := actorOf(ctx)
	if err != nil {
		return store.Event{}, store.Calendar{}, a, err
	}
	if err := validID(id); err != nil {
		return store.Event{}, store.Calendar{}, a, err
	}
	ev, err := store.GetEvent(ctx, s.Store.Pool, id)
	if err != nil {
		return ev, store.Calendar{}, a, eventErr(err)
	}
	c, err := s.Store.GetCalendar(ctx, ev.CalendarID)
	if err != nil {
		return ev, c, a, storeErr(err)
	}
	if !canSee(a, c, ev) {
		return ev, c, a, fail(connect.CodeNotFound, "event_not_found", "evento")
	}
	return ev, c, a, nil
}

// ListEvents: el personal ve todo el tablero; un cliente final, solo sus citas.
func (s EventServer) ListEvents(ctx context.Context, req *calendarv1.ListEventsRequest) (*calendarv1.ListEventsResponse, error) {
	c, a, err := s.calendar(ctx, req.GetCalendarId(), false)
	if err != nil {
		return nil, err
	}
	customer := ""
	if a.Role == "customer" {
		if a.UserID == "" {
			return nil, fail(connect.CodeUnauthenticated, "unauthenticated", "cliente sin identidad")
		}
		customer = a.UserID
	} else if err := requireOrg(a, c.OrgID, "owner", "editor", "observer"); err != nil {
		return nil, err
	}
	if req.GetFrom() == nil || req.GetTo() == nil {
		return nil, fail(connect.CodeInvalidArgument, "invalid_range", "faltan desde y hasta")
	}
	from, to := req.GetFrom().AsTime(), req.GetTo().AsTime()
	if !to.After(from) || to.Sub(from) > maxListWindow {
		return nil, fail(connect.CodeInvalidArgument, "invalid_range", "rango de 1 minuto a 400 días")
	}
	evs, err := store.ListEvents(ctx, s.Store.Pool, c.ID, from, to, customer, req.GetIncludeCancelled())
	if err != nil {
		return nil, err
	}
	now := s.Clock.Now()
	out := &calendarv1.ListEventsResponse{}
	for _, ev := range evs {
		if expiredHold(ev, now) {
			continue
		}
		out.Events = append(out.Events, toProto(ev, customer != ""))
	}
	return out, nil
}

// GetEvent devuelve un evento visible para el actor.
func (s EventServer) GetEvent(ctx context.Context, req *calendarv1.GetEventRequest) (*calendarv1.Event, error) {
	ev, _, a, err := s.load(ctx, req.GetId())
	if err != nil {
		return nil, err
	}
	p := toProto(ev, a.Role == "customer")
	if p.Recurrence != nil {
		if sr, err := store.GetSeries(ctx, s.Store.Pool, ev.SeriesID); err == nil {
			p.Recurrence.Rrule = sr.RRule
		}
	}
	return p, nil
}

// CreateEvent crea citas o bloqueos del personal (sueltos o en serie). No exige horario laboral.
func (s EventServer) CreateEvent(ctx context.Context, req *calendarv1.CreateEventRequest) (*calendarv1.CreateEventResponse, error) {
	c, a, err := s.calendar(ctx, req.GetCalendarId(), false)
	if err != nil {
		return nil, err
	}
	if err := requireStaff(a, c); err != nil {
		return nil, err
	}
	if c.Status != "active" {
		return nil, fail(connect.CodeFailedPrecondition, "calendar_archived", "tablero archivado")
	}
	d, err := s.draft(ctx, c, a, req)
	if err != nil {
		return nil, err
	}
	if req.GetRrule() != "" {
		return s.createSeries(ctx, c, a, req, d)
	}
	resp := &calendarv1.CreateEventResponse{}
	err = s.Store.InTx(ctx, func(tx pgx.Tx) error {
		if err := store.LockCalendar(ctx, tx, c.ID); err != nil {
			return err
		}
		if key := req.GetIdempotencyKey(); key != "" {
			if prev, err := store.EventByIdempotency(ctx, tx, c.ID, key); err == nil {
				resp.Event = toProto(prev, false)
				return nil
			}
		}
		now := s.Clock.Now()
		appts, blocks, err := store.LoadOccupancy(ctx, tx, c.ID, d.Start.Add(-24*time.Hour), d.End.Add(24*time.Hour), now)
		if err != nil {
			return err
		}
		if d.Kind == "appointment" {
			seat, reason := pickSeat(c.Capacity, appts, blocks, d.Start, d.End, minutes(d.BufferBeforeMin), minutes(d.BufferAfterMin))
			if reason != "" {
				return slotErr(reason)
			}
			d.Seat = seat
		} else {
			affected, err := s.overlapping(ctx, tx, c, a, d.Start, d.End, req.GetCancelOverlapping())
			if err != nil {
				return err
			}
			for _, ev := range affected {
				resp.Affected = append(resp.Affected, toProto(ev, false))
			}
		}
		ev, err := store.InsertEvent(ctx, tx, d)
		if err != nil {
			return eventErr(err)
		}
		resp.Event = toProto(ev, false)
		return s.emit(ctx, tx, eventType(ev, "created"), c, a, ev, nil)
	})
	if err != nil {
		return nil, err
	}
	return resp, nil
}

// draft valida y arma el evento a crear a partir de la petición.
func (s EventServer) draft(ctx context.Context, c store.Calendar, a auth.ActorClaims, req *calendarv1.CreateEventRequest) (store.Event, error) {
	kind := req.GetKind()
	if kind == "" {
		kind = "appointment"
	}
	if kind != "appointment" && kind != "block" {
		return store.Event{}, fail(connect.CodeInvalidArgument, "invalid_kind", "tipo %q", kind)
	}
	if req.GetStart() == nil {
		return store.Event{}, fail(connect.CodeInvalidArgument, "invalid_range", "falta el inicio")
	}
	if len([]rune(req.GetTitle())) > maxTitle || len([]rune(req.GetInternalNotes())) > maxNotes {
		return store.Event{}, fail(connect.CodeInvalidArgument, "too_long", "título o notas demasiado largos")
	}
	d := store.Event{
		CalendarID: c.ID, Kind: kind, Status: "confirmed", Start: req.GetStart().AsTime().UTC(), Seat: 1,
		Title: req.GetTitle(), InternalNotes: req.GetInternalNotes(), CreatedBy: a.UserID, CreatedVia: viaOf(a),
		IdempotencyKey: req.GetIdempotencyKey(),
	}
	if kind == "appointment" {
		d.CustomerUserID = req.GetCustomerUserId()
		if d.CustomerUserID != "" {
			if _, err := uuid.Parse(d.CustomerUserID); err != nil {
				return d, fail(connect.CodeInvalidArgument, "invalid_customer", "cliente final")
			}
		}
		d.Attendee = attendeeOf(req.GetAttendee())
	}
	if id := req.GetServiceId(); id != "" && kind == "appointment" {
		sv, err := s.Store.GetService(ctx, c.ID, id)
		if errors.Is(err, store.ErrNotFound) {
			return d, fail(connect.CodeNotFound, "service_not_found", "servicio %s", id)
		}
		if err != nil {
			return d, err
		}
		d.ServiceID, d.BufferBeforeMin, d.BufferAfterMin = sv.ID, sv.BufferBeforeMin, sv.BufferAfterMin
		d.End = d.Start.Add(minutes(sv.DurationMin))
	}
	if req.GetEnd() != nil {
		d.End = req.GetEnd().AsTime().UTC()
	}
	limit := maxAppointment
	if kind == "block" {
		limit = maxBlock
	}
	if d.End.IsZero() || !d.End.After(d.Start) || d.End.Sub(d.Start) > limit {
		return d, fail(connect.CodeInvalidArgument, "invalid_range", "fin inválido")
	}
	return d, nil
}

func viaOf(a auth.ActorClaims) string {
	if a.Via == "" {
		return "panel"
	}
	return a.Via
}

func slotErr(reason string) error {
	if reason == "blocked" {
		return fail(connect.CodeAborted, "slot_blocked", "el horario está bloqueado")
	}
	return fail(connect.CodeAborted, "slot_taken", "el horario ya no está libre")
}

// overlapping devuelve las citas vivas que solapan [s, e); con cancel las cancela y avisa.
func (s EventServer) overlapping(ctx context.Context, tx pgx.Tx, c store.Calendar, a auth.ActorClaims, from, to time.Time, cancel bool) ([]store.Event, error) {
	evs, err := store.ListEvents(ctx, tx, c.ID, from, to, "", false)
	if err != nil {
		return nil, err
	}
	now := s.Clock.Now()
	var out []store.Event
	for _, ev := range evs {
		if ev.Kind != "appointment" || expiredHold(ev, now) {
			continue
		}
		if cancel {
			status, reason := "cancelled", "blocked"
			upd, err := store.UpdateEvent(ctx, tx, ev.ID, store.EventChange{Status: &status, CancelReason: &reason,
				ClearHold: true, BumpICal: true, Now: now})
			if err != nil {
				return nil, eventErr(err)
			}
			if err := s.emit(ctx, tx, eventType(upd, "cancelled"), c, a, upd, nil); err != nil {
				return nil, err
			}
			ev = upd
		}
		out = append(out, ev)
	}
	return out, nil
}

// HoldSlot aparta un horario reservable por 10 minutos mientras el cliente final verifica su correo.
func (s EventServer) HoldSlot(ctx context.Context, req *calendarv1.HoldSlotRequest) (*calendarv1.Event, error) {
	a, err := actorOf(ctx)
	if err != nil {
		return nil, err
	}
	if a.UserID == "" {
		return nil, fail(connect.CodeUnauthenticated, "unauthenticated", "falta el titular del hold")
	}
	c, _, err := s.calendar(ctx, req.GetCalendarId(), false)
	if err != nil {
		return nil, err
	}
	if c.Status != "active" || c.OrgStatus == "read_only" || c.OrgStatus == "suspended" {
		return nil, fail(connect.CodeFailedPrecondition, "calendar_unavailable", "el tablero no admite reservas")
	}
	sv, err := s.Store.GetService(ctx, c.ID, req.GetServiceId())
	if errors.Is(err, store.ErrNotFound) || (err == nil && !sv.Active) {
		return nil, fail(connect.CodeNotFound, "service_not_found", "servicio %s", req.GetServiceId())
	}
	if err != nil {
		return nil, err
	}
	if req.GetStart() == nil {
		return nil, fail(connect.CodeInvalidArgument, "invalid_range", "falta el inicio")
	}
	if len([]rune(req.GetCustomerNotes())) > maxNotes {
		return nil, fail(connect.CodeInvalidArgument, "too_long", "notas demasiado largas")
	}
	start := req.GetStart().AsTime().UTC()
	in, err := s.BuildInput(ctx, c, sv, start, start.Add(time.Minute), nil)
	if err != nil {
		return nil, err
	}
	var out store.Event
	err = s.Store.InTx(ctx, func(tx pgx.Tx) error {
		if err := store.LockCalendar(ctx, tx, c.ID); err != nil {
			return err
		}
		now := s.Clock.Now()
		if key := req.GetIdempotencyKey(); key != "" {
			if prev, err := store.EventByIdempotency(ctx, tx, c.ID, key); err == nil {
				if prev.CreatedBy != a.UserID {
					return fail(connect.CodeAlreadyExists, "idempotency_conflict", "clave de idempotencia en uso")
				}
				out = prev
				return nil
			}
		}
		if _, err := store.ExpireHolds(ctx, tx, c.ID, now); err != nil {
			return err
		}
		if n, err := store.CountActiveHolds(ctx, tx, a.UserID, now); err != nil {
			return err
		} else if n >= maxHoldsPerHolder {
			return fail(connect.CodeResourceExhausted, "too_many_holds", "demasiados horarios apartados")
		}
		occ := txOccupancy{tx: tx, now: now}
		ok, err := s.slotAvailable(ctx, in, c.ID, start, occ)
		if err != nil {
			return err
		}
		if !ok {
			return fail(connect.CodeAborted, "slot_taken", "el horario ya no está libre")
		}
		end := start.Add(minutes(sv.DurationMin))
		appts, blocks, err := occ.Load(ctx, c.ID, start.Add(-24*time.Hour), end.Add(24*time.Hour))
		if err != nil {
			return err
		}
		seat, reason := pickSeat(c.Capacity, appts, blocks, start, end, minutes(sv.BufferBeforeMin), minutes(sv.BufferAfterMin))
		if reason != "" {
			return slotErr(reason)
		}
		expires := now.Add(HoldTTL)
		out, err = store.InsertEvent(ctx, tx, store.Event{
			CalendarID: c.ID, Kind: "appointment", Status: "held", Start: start, End: end, Seat: seat,
			ServiceID: sv.ID, BufferBeforeMin: sv.BufferBeforeMin, BufferAfterMin: sv.BufferAfterMin,
			Attendee: attendeeOf(req.GetAttendee()), CustomerNotes: req.GetCustomerNotes(), CreatedBy: a.UserID,
			CreatedVia: viaOf(a), HoldExpiresAt: &expires, IdempotencyKey: req.GetIdempotencyKey(),
		})
		return eventErr(err)
	})
	if err != nil {
		return nil, err
	}
	p := toProto(out, true)
	p.CreatedBy = out.CreatedBy // el titular es quien llama
	return p, nil
}

// ConfirmHold convierte el hold en cita del cliente final verificado que presenta el titular.
func (s EventServer) ConfirmHold(ctx context.Context, req *calendarv1.ConfirmHoldRequest) (*calendarv1.Event, error) {
	a, err := actorOf(ctx)
	if err != nil {
		return nil, err
	}
	if a.Role != "customer" || a.UserID == "" {
		return nil, fail(connect.CodePermissionDenied, "permission_denied", "solo un cliente final verificado")
	}
	if err := validID(req.GetId()); err != nil {
		return nil, err
	}
	if len([]rune(req.GetCustomerNotes())) > maxNotes {
		return nil, fail(connect.CodeInvalidArgument, "too_long", "notas demasiado largas")
	}
	held, err := store.GetEvent(ctx, s.Store.Pool, req.GetId())
	if err != nil {
		return nil, eventErr(err)
	}
	c, err := s.Store.GetCalendar(ctx, held.CalendarID)
	if err != nil {
		return nil, err
	}
	var out store.Event
	err = s.Store.InTx(ctx, func(tx pgx.Tx) error {
		ev, err := store.GetEventForUpdate(ctx, tx, req.GetId())
		if err != nil {
			return eventErr(err)
		}
		if ev.Status == "confirmed" && ev.CustomerUserID == a.UserID && ev.CreatedBy == req.GetHolderId() {
			out = ev // reintento
			return nil
		}
		if ev.Status != "held" || ev.CreatedBy != req.GetHolderId() || req.GetHolderId() == "" {
			return fail(connect.CodeNotFound, "hold_not_found", "hold")
		}
		if expiredHold(ev, s.Clock.Now()) {
			return fail(connect.CodeFailedPrecondition, "hold_expired", "el horario apartado caducó")
		}
		status, customer := "confirmed", a.UserID
		ch := store.EventChange{Status: &status, ClearHold: true, CustomerUserID: &customer}
		if req.GetAttendee() != nil {
			att := attendeeOf(req.GetAttendee())
			ch.Attendee = &att
		}
		if req.GetCustomerNotes() != "" {
			notes := req.GetCustomerNotes()
			ch.CustomerNotes = &notes
		}
		out, err = store.UpdateEvent(ctx, tx, ev.ID, ch)
		if err != nil {
			return eventErr(err)
		}
		return s.emit(ctx, tx, "booking.created", c, a, out, nil)
	})
	if err != nil {
		return nil, err
	}
	return toProto(out, true), nil
}

// ReleaseHold libera un hold del titular (el visitante cambió de opinión).
func (s EventServer) ReleaseHold(ctx context.Context, req *calendarv1.ReleaseHoldRequest) (*calendarv1.ReleaseHoldResponse, error) {
	if _, err := actorOf(ctx); err != nil {
		return nil, err
	}
	if err := validID(req.GetId()); err != nil {
		return nil, err
	}
	err := s.Store.InTx(ctx, func(tx pgx.Tx) error {
		ev, err := store.GetEventForUpdate(ctx, tx, req.GetId())
		if err != nil {
			return eventErr(err)
		}
		if ev.Status != "held" || ev.CreatedBy != req.GetHolderId() || req.GetHolderId() == "" {
			return fail(connect.CodeNotFound, "hold_not_found", "hold")
		}
		status, reason := "cancelled", "released"
		_, err = store.UpdateEvent(ctx, tx, ev.ID, store.EventChange{Status: &status, CancelReason: &reason, ClearHold: true, Now: s.Clock.Now()})
		return eventErr(err)
	})
	if err != nil {
		return nil, err
	}
	return &calendarv1.ReleaseHoldResponse{}, nil
}

// RescheduleBooking mueve una cita. El cliente final solo puede moverla a un horario reservable y en plazo.
func (s EventServer) RescheduleBooking(ctx context.Context, req *calendarv1.RescheduleBookingRequest) (*calendarv1.Event, error) {
	ev, c, a, err := s.load(ctx, req.GetId())
	if err != nil {
		return nil, err
	}
	customer := a.Role == "customer"
	if !customer {
		if err := requireStaff(a, c); err != nil {
			return nil, err
		}
	}
	if ev.Kind != "appointment" || ev.Status != "confirmed" {
		return nil, fail(connect.CodeFailedPrecondition, "not_reschedulable", "solo citas confirmadas")
	}
	if err := s.cancellationAllowed(a, c, ev); err != nil {
		return nil, err
	}
	if req.GetStart() == nil {
		return nil, fail(connect.CodeInvalidArgument, "invalid_range", "falta el inicio")
	}
	start := req.GetStart().AsTime().UTC()
	end := start.Add(ev.End.Sub(ev.Start))
	var in availability.Input
	if customer {
		sv, err := s.Store.GetService(ctx, c.ID, ev.ServiceID)
		if err != nil || !sv.Active {
			return nil, fail(connect.CodeFailedPrecondition, "not_reschedulable", "el servicio ya no está disponible")
		}
		if in, err = s.BuildInput(ctx, c, sv, start, start.Add(time.Minute), nil); err != nil {
			return nil, err
		}
		end = start.Add(minutes(sv.DurationMin))
	}
	var out store.Event
	err = s.Store.InTx(ctx, func(tx pgx.Tx) error {
		if err := store.LockCalendar(ctx, tx, c.ID); err != nil {
			return err
		}
		now := s.Clock.Now()
		occ := txOccupancy{tx: tx, now: now, exclude: ev.ID}
		if customer {
			ok, err := s.slotAvailable(ctx, in, c.ID, start, occ)
			if err != nil {
				return err
			}
			if !ok {
				return fail(connect.CodeAborted, "slot_taken", "el horario ya no está libre")
			}
		}
		appts, blocks, err := occ.Load(ctx, c.ID, start.Add(-24*time.Hour), end.Add(24*time.Hour))
		if err != nil {
			return err
		}
		seat, reason := pickSeat(c.Capacity, appts, blocks, start, end, minutes(ev.BufferBeforeMin), minutes(ev.BufferAfterMin))
		if reason != "" {
			return slotErr(reason)
		}
		ch := store.EventChange{Start: &start, End: &end, Seat: &seat, BumpICal: true, ExpectedVersion: int(req.GetExpectedVersion())}
		if ev.SeriesID != "" {
			t := true
			ch.IsException = &t
		}
		out, err = store.UpdateEvent(ctx, tx, ev.ID, ch)
		if err != nil {
			return eventErr(err)
		}
		return s.emit(ctx, tx, eventType(out, "rescheduled"), c, a, out, &ev)
	})
	if err != nil {
		return nil, err
	}
	return toProto(out, customer), nil
}

// MarkAttendance registra si el cliente vino (solo citas que ya empezaron).
func (s EventServer) MarkAttendance(ctx context.Context, req *calendarv1.MarkAttendanceRequest) (*calendarv1.Event, error) {
	ev, c, a, err := s.load(ctx, req.GetId())
	if err != nil {
		return nil, err
	}
	if err := requireStaff(a, c); err != nil {
		return nil, err
	}
	att := req.GetAttendance()
	if att != "" && att != "attended" && att != "no_show" {
		return nil, fail(connect.CodeInvalidArgument, "invalid_attendance", "%q", att)
	}
	if ev.Kind != "appointment" || ev.Status != "confirmed" || ev.Start.After(s.Clock.Now()) {
		return nil, fail(connect.CodeFailedPrecondition, "not_started", "la cita aún no empieza")
	}
	out, err := store.UpdateEvent(ctx, s.Store.Pool, ev.ID, store.EventChange{Attendance: &att})
	if err != nil {
		return nil, eventErr(err)
	}
	return toProto(out, false), nil
}

// ListCustomerBookings devuelve las citas del cliente final que llama (todas sus organizaciones o una).
func (s EventServer) ListCustomerBookings(ctx context.Context, req *calendarv1.ListCustomerBookingsRequest) (*calendarv1.ListEventsResponse, error) {
	a, err := actorOf(ctx)
	if err != nil {
		return nil, err
	}
	if a.Role != "customer" || a.UserID == "" {
		return nil, fail(connect.CodePermissionDenied, "permission_denied", "solo clientes finales")
	}
	if id := req.GetOrgId(); id != "" {
		if _, err := uuid.Parse(id); err != nil {
			return nil, fail(connect.CodeInvalidArgument, "invalid_org", "organización")
		}
	}
	from := s.Clock.Now()
	if req.GetIncludePast() {
		from = time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	}
	evs, err := store.ListCustomerEvents(ctx, s.Store.Pool, a.UserID, req.GetOrgId(), from)
	if err != nil {
		return nil, err
	}
	out := &calendarv1.ListEventsResponse{}
	for _, ev := range evs {
		out.Events = append(out.Events, toProto(ev, true))
	}
	return out, nil
}
