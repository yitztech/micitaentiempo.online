package engine

import (
	"context"
	"errors"
	"slices"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/auth"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/availability"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/outbox"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/store"
)

// HoldTTL es lo que dura un horario apartado mientras el cliente final verifica su correo.
const HoldTTL = 10 * time.Minute

// SeriesHorizon es hasta dónde se materializan las series.
const SeriesHorizon = 18 * 30 * 24 * time.Hour

// poolOccupancy lee la ocupación fuera de transacción (cálculo de huecos).
type poolOccupancy struct{ e *Engine }

func (o poolOccupancy) Load(ctx context.Context, calendarID string, from, to time.Time) ([]availability.Appointment, []domain.Interval, error) {
	appts, blocks, err := store.LoadOccupancy(ctx, o.e.Store.Pool, calendarID, from, to, o.e.Clock.Now())
	if err != nil {
		return nil, nil, err
	}
	ext, err := store.ExternalBusy(ctx, o.e.Store.Pool, calendarID, from, to)
	return appts, append(blocks, ext...), err
}

// txOccupancy lee la ocupación dentro de la transacción que escribe (ve sus propios cambios).
type txOccupancy struct {
	tx      pgx.Tx
	now     time.Time
	exclude string
}

func (o txOccupancy) Load(ctx context.Context, calendarID string, from, to time.Time) ([]availability.Appointment, []domain.Interval, error) {
	appts, blocks, err := store.LoadOccupancy(ctx, o.tx, calendarID, from, to, o.now)
	if err != nil {
		return nil, nil, err
	}
	// El ocupado de Google, Outlook o iCloud ocupa todos los asientos.
	ext, err := store.ExternalBusy(ctx, o.tx, calendarID, from, to)
	blocks = append(blocks, ext...)
	if o.exclude != "" {
		appts = slices.DeleteFunc(appts, func(a availability.Appointment) bool { return a.ID == o.exclude })
	}
	return appts, blocks, err
}

// freshBusy refresca el ocupado externo del tablero (live: consulta en vivo antes de apartar o confirmar).
func (e *Engine) freshBusy(ctx context.Context, calendarID string, live bool) {
	if e.Sync != nil {
		e.Sync.EnsureFresh(ctx, calendarID, live)
	}
}

// DefaultOccupancy devuelve la ocupación real del motor (citas, holds y bloqueos).
func (e *Engine) DefaultOccupancy() Occupancy { return poolOccupancy{e: e} }

// pickSeat elige el asiento libre más bajo para [s, end) con márgenes, o devuelve el motivo del choque.
func pickSeat(capacity int, appts []availability.Appointment, blocks []domain.Interval, s, end time.Time, bb, ba time.Duration) (int, string) {
	want := domain.Interval{Start: s.Add(-bb), End: end.Add(ba)}
	for _, b := range blocks {
		if b.Overlaps(want) {
			return 0, "blocked"
		}
	}
	used := map[int]bool{}
	for _, a := range appts {
		occupied := domain.Interval{Start: a.Interval.Start.Add(-a.BufferBefore), End: a.Interval.End.Add(a.BufferAfter)}
		if occupied.Overlaps(want) {
			used[a.Seat] = true
		}
	}
	for seat := 1; seat <= capacity; seat++ {
		if !used[seat] {
			return seat, ""
		}
	}
	return 0, "seat_unavailable"
}

// emit encola el evento de dominio en la misma transacción (outbox, ADR 0004).
func (e *Engine) emit(ctx context.Context, tx pgx.Tx, typ string, c store.Calendar, a auth.ActorClaims, ev store.Event, previous *store.Event) error {
	if e.Jobs == nil {
		return nil
	}
	subject := map[string]any{
		"event_id": ev.ID, "kind": ev.Kind, "status": ev.Status,
		"start": ev.Start.Format(time.RFC3339), "end": ev.End.Format(time.RFC3339),
		"customer_user_id": ev.CustomerUserID, "service_id": ev.ServiceID, "series_id": ev.SeriesID,
		"title": ev.Title, "attendee_email": ev.Attendee.Email, "attendee_name": ev.Attendee.Name,
		"attendee_locale": ev.Attendee.Locale, "attendee_timezone": ev.Attendee.Timezone,
		"calendar_name": c.Name, "calendar_timezone": c.Timezone,
	}
	if previous != nil {
		subject["previous"] = map[string]any{"start": previous.Start.Format(time.RFC3339), "end": previous.End.Format(time.RFC3339)}
	}
	if err := e.Sync.EnqueuePush(ctx, tx, c.ID, ev.ID); err != nil {
		return err
	}
	return outbox.Enqueue(ctx, e.Jobs, tx, outbox.Event{
		EventID: newEventID(), Type: typ, OccurredAt: e.Clock.Now(), OrgID: c.OrgID, CalendarID: c.ID,
		Actor: a, Subject: subject, Version: int32(ev.Version), //nolint:gosec // versión pequeña
	})
}

// eventType: reservaciones de clientes finales → booking.*; el resto → event.*.
func eventType(ev store.Event, action string) string {
	if ev.Kind == "appointment" && ev.CustomerUserID != "" {
		return "booking." + action
	}
	return "event." + action
}

// requireStaff exige propietario o editor del tablero.
func requireStaff(a auth.ActorClaims, c store.Calendar) error {
	if err := requireOrg(a, c.OrgID, "owner", "editor"); err != nil {
		return err
	}
	if c.OrgStatus == "read_only" || c.OrgStatus == "suspended" {
		return fail(connect.CodeFailedPrecondition, "org_read_only", "organización en solo lectura")
	}
	return nil
}

// canSee: el personal ve todo; un cliente final solo lo suyo.
func canSee(a auth.ActorClaims, c store.Calendar, ev store.Event) bool {
	if a.Role == "customer" {
		return ev.CustomerUserID != "" && ev.CustomerUserID == a.UserID
	}
	return requireOrg(a, c.OrgID, "owner", "editor", "observer") == nil
}

func eventErr(err error) error {
	switch {
	case errors.Is(err, store.ErrOverlap):
		return fail(connect.CodeAborted, "slot_taken", "el horario ya no está libre")
	case errors.Is(err, store.ErrVersion):
		return fail(connect.CodeAborted, "conflict", "el evento cambió; recarga y vuelve a intentarlo")
	case errors.Is(err, store.ErrNotFound):
		return fail(connect.CodeNotFound, "event_not_found", "evento")
	default:
		return storeErr(err)
	}
}

// slotAvailable comprueba que start sea exactamente un horario reservable. in se arma fuera de la
// transacción (BuildInput sin ocupación) y occ lee la ocupación dentro de ella, para no pedir otra
// conexión al pool mientras se tiene el candado del tablero.
func (e *Engine) slotAvailable(ctx context.Context, in availability.Input, calendarID string, start time.Time, occ Occupancy) (bool, error) {
	appts, blocks, err := occ.Load(ctx, calendarID, in.From.Add(-24*time.Hour), in.To.Add(24*time.Hour))
	if err != nil {
		return false, err
	}
	in.Appointments, in.Blocks = appts, blocks
	for _, s := range availability.Compute(in) {
		if s.Start.Equal(start) {
			return true, nil
		}
	}
	return false, nil
}

// cancellationAllowed aplica la antelación mínima de autoservicio del tablero a clientes finales.
func (e *Engine) cancellationAllowed(a auth.ActorClaims, c store.Calendar, ev store.Event) error {
	if a.Role != "customer" {
		return nil
	}
	now := e.Clock.Now()
	if !ev.Start.After(now) {
		return fail(connect.CodeFailedPrecondition, "too_late", "la cita ya empezó")
	}
	if n := c.BookingPolicy.CancelMinNoticeMinutes; n > 0 && ev.Start.Sub(now) < time.Duration(n)*time.Minute {
		return fail(connect.CodeFailedPrecondition, "too_late", "fuera del plazo para cambiarla por tu cuenta")
	}
	return nil
}
