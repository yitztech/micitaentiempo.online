package engine

import (
	"context"
	"errors"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5"
	calendarv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/calendar/v1"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/auth"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/availability"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/recurrence"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/store"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// localLayout es el formato de RECURRENCE-ID y EXDATE en hora de pared.
const localLayout = "2006-01-02T15:04"

// wall guarda una hora de pared como instante UTC «ficticio» (columnas timestamp de series y recurrence_id).
func wall(st recurrence.Start) time.Time {
	return time.Date(st.Date.Year, st.Date.Month, st.Date.Day, int(st.Clock)/60, int(st.Clock)%60, 0, 0, time.UTC)
}

func startOf(t time.Time) recurrence.Start {
	t = t.UTC()
	return recurrence.Start{Date: domain.DateOf(t), Clock: domain.Clock(t.Hour()*60 + t.Minute())}
}

func localStart(t time.Time, loc *time.Location) recurrence.Start {
	l := t.In(loc)
	return recurrence.Start{Date: domain.DateOf(l), Clock: domain.Clock(l.Hour()*60 + l.Minute())}
}

func exdateSet(ts []time.Time) map[string]bool {
	m := map[string]bool{}
	for _, t := range ts {
		m[t.UTC().Format(localLayout)] = true
	}
	return m
}

func parseRule(s string) (recurrence.Rule, error) {
	r, err := recurrence.Parse(s)
	if err != nil {
		return r, fail(connect.CodeInvalidArgument, "invalid_rrule", "%v", err)
	}
	return r, nil
}

// untilOf fija el fin de la serie cuando se conoce: UNTIL, o la última instancia si COUNT ya está completo.
func untilOf(r recurrence.Rule, all []recurrence.Occurrence) *time.Time {
	if r.Count > 0 && len(all) >= r.Count {
		t := all[len(all)-1].Start
		return &t
	}
	if !r.Until.IsZero() {
		t := r.Until
		return &t
	}
	return nil
}

// placed es una instancia con asiento asignado.
type placed struct {
	occ  recurrence.Occurrence
	seat int
}

// place asigna asiento a cada instancia (las citas nuevas cuentan para las siguientes) y separa los conflictos.
func place(c store.Calendar, kind string, occs []recurrence.Occurrence, appts []availability.Appointment, blocks []domain.Interval, bb, ba time.Duration) ([]placed, []*calendarv1.Conflict) {
	var ok []placed
	var conflicts []*calendarv1.Conflict
	for _, o := range occs {
		if kind != "appointment" {
			ok = append(ok, placed{occ: o, seat: 1})
			continue
		}
		seat, reason := pickSeat(c.Capacity, appts, blocks, o.Start, o.End, bb, ba)
		if reason != "" {
			conflicts = append(conflicts, &calendarv1.Conflict{Start: timestamppb.New(o.Start), Reason: reason})
			continue
		}
		appts = append(appts, availability.Appointment{Interval: domain.Interval{Start: o.Start, End: o.End}, Seat: seat, BufferBefore: bb, BufferAfter: ba})
		ok = append(ok, placed{occ: o, seat: seat})
	}
	return ok, conflicts
}

// insertInstances crea las instancias colocadas de una serie.
func insertInstances(ctx context.Context, tx pgx.Tx, sr store.Series, ps []placed, firstKey string) ([]store.Event, error) {
	out := make([]store.Event, 0, len(ps))
	for i, p := range ps {
		rid := wall(p.occ.Local)
		key := ""
		if i == 0 {
			key = firstKey
		}
		t := sr.Template
		ev, err := store.InsertEvent(ctx, tx, store.Event{
			CalendarID: sr.CalendarID, Kind: sr.Kind, Status: "confirmed", Start: p.occ.Start, End: p.occ.End, Seat: p.seat,
			SeriesID: sr.ID, RecurrenceID: &rid, ServiceID: t.ServiceID, BufferBeforeMin: t.BufferBeforeMin,
			BufferAfterMin: t.BufferAfterMin, Title: t.Title, CustomerUserID: t.CustomerUserID, Attendee: t.Attendee,
			InternalNotes: t.InternalNotes, CreatedBy: sr.CreatedBy, CreatedVia: t.CreatedVia, IdempotencyKey: key,
		})
		if err != nil {
			return nil, eventErr(err)
		}
		out = append(out, ev)
	}
	return out, nil
}

// createSeries crea una serie materializada a 18 meses. Con "abort" no se escribe nada si hay conflictos.
func (s EventServer) createSeries(ctx context.Context, c store.Calendar, a auth.ActorClaims, req *calendarv1.CreateEventRequest, d store.Event) (*calendarv1.CreateEventResponse, error) {
	rule, err := parseRule(req.GetRrule())
	if err != nil {
		return nil, err
	}
	onConflict := req.GetOnConflict()
	if onConflict == "" {
		onConflict = "abort"
	}
	if onConflict != "abort" && onConflict != "skip" {
		return nil, fail(connect.CodeInvalidArgument, "invalid_on_conflict", "%q", onConflict)
	}
	dur := d.End.Sub(d.Start)
	if d.Start.Second() != 0 || d.Start.Nanosecond() != 0 || dur%time.Minute != 0 {
		return nil, fail(connect.CodeInvalidArgument, "invalid_range", "las series van en minutos exactos")
	}
	loc, err := location(c.Timezone)
	if err != nil {
		return nil, err
	}
	now := s.Clock.Now()
	horizon := now.Add(SeriesHorizon)
	st := localStart(d.Start, loc)
	occs := recurrence.Expand(rule, st, loc, dur, horizon, nil)
	if len(occs) == 0 {
		return nil, fail(connect.CodeInvalidArgument, "empty_series", "la regla no produce fechas")
	}
	resp := &calendarv1.CreateEventResponse{}
	err = s.Store.InTx(ctx, func(tx pgx.Tx) error {
		if err := store.LockCalendar(ctx, tx, c.ID); err != nil {
			return err
		}
		if key := req.GetIdempotencyKey(); key != "" {
			if prev, err := store.EventByIdempotency(ctx, tx, c.ID, key); err == nil {
				resp.Event, resp.SeriesId = toProto(prev, false), prev.SeriesID
				return nil
			}
		}
		appts, blocks, err := store.LoadOccupancy(ctx, tx, c.ID, occs[0].Start.Add(-24*time.Hour), occs[len(occs)-1].End.Add(24*time.Hour), now)
		if err != nil {
			return err
		}
		ok, conflicts := place(c, d.Kind, occs, appts, blocks, minutes(d.BufferBeforeMin), minutes(d.BufferAfterMin))
		resp.Conflicts = conflicts
		if len(conflicts) > 0 && onConflict == "abort" {
			return errRollback
		}
		if len(ok) == 0 {
			return fail(connect.CodeAborted, "series_conflict", "ninguna fecha está libre")
		}
		exdates := []time.Time{}
		for _, cf := range conflicts {
			exdates = append(exdates, wall(localStart(cf.GetStart().AsTime(), loc)))
		}
		sr, err := store.InsertSeries(ctx, tx, store.Series{
			CalendarID: c.ID, Kind: d.Kind, RRule: rule.String(), DTStartLocal: wall(st), TZID: c.Timezone,
			DurationMin: int(dur / time.Minute), UntilUTC: untilOf(rule, occs), ExdatesLocal: exdates,
			MaterializedUntil: horizon, CreatedBy: a.UserID,
			Template: store.SeriesTemplate{Title: d.Title, ServiceID: d.ServiceID, CustomerUserID: d.CustomerUserID,
				Attendee: d.Attendee, InternalNotes: d.InternalNotes, BufferBeforeMin: d.BufferBeforeMin,
				BufferAfterMin: d.BufferAfterMin, CreatedVia: d.CreatedVia},
		})
		if err != nil {
			return err
		}
		evs, err := insertInstances(ctx, tx, sr, ok, req.GetIdempotencyKey())
		if err != nil {
			return err
		}
		resp.Event, resp.SeriesId, resp.Instances = toProto(evs[0], false), sr.ID, i32(len(evs))
		return s.emit(ctx, tx, "series.created", c, a, evs[0], nil)
	})
	if err != nil && !errors.Is(err, errRollback) {
		return nil, err
	}
	return resp, nil
}

// materialize crea las instancias de la serie que empiezan después de after y hasta horizon.
// Las que chocan se excluyen (EXDATE) y se devuelven como conflictos.
func (e *Engine) materialize(ctx context.Context, tx pgx.Tx, c store.Calendar, sr *store.Series, after, horizon time.Time) ([]store.Event, []*calendarv1.Conflict, error) {
	rule, err := parseRule(sr.RRule)
	if err != nil {
		return nil, nil, err
	}
	loc, err := location(sr.TZID)
	if err != nil {
		return nil, nil, err
	}
	dur := time.Duration(sr.DurationMin) * time.Minute
	all := recurrence.Expand(rule, startOf(sr.DTStartLocal), loc, dur, horizon, nil)
	existing, err := store.SeriesRecurrenceIDs(ctx, tx, sr.ID)
	if err != nil {
		return nil, nil, err
	}
	ex := exdateSet(sr.ExdatesLocal)
	var todo []recurrence.Occurrence
	for _, o := range all {
		if o.Start.After(after) && !ex[recurrence.LocalKey(o.Local)] && !existing[wall(o.Local)] {
			todo = append(todo, o)
		}
	}
	sr.MaterializedUntil = horizon
	if u := untilOf(rule, all); u != nil {
		sr.UntilUTC = u
	}
	if len(todo) == 0 {
		return nil, nil, store.UpdateSeries(ctx, tx, *sr)
	}
	appts, blocks, err := store.LoadOccupancy(ctx, tx, c.ID, todo[0].Start.Add(-24*time.Hour), todo[len(todo)-1].End.Add(24*time.Hour), e.Clock.Now())
	if err != nil {
		return nil, nil, err
	}
	t := sr.Template
	ok, conflicts := place(c, sr.Kind, todo, appts, blocks, minutes(t.BufferBeforeMin), minutes(t.BufferAfterMin))
	for _, cf := range conflicts {
		sr.ExdatesLocal = append(sr.ExdatesLocal, wall(localStart(cf.GetStart().AsTime(), loc)))
	}
	evs, err := insertInstances(ctx, tx, *sr, ok, "")
	if err != nil {
		return nil, nil, err
	}
	return evs, conflicts, store.UpdateSeries(ctx, tx, *sr)
}

// UpdateEvent cambia un evento (scope "this") o una serie ("following" | "all").
func (s EventServer) UpdateEvent(ctx context.Context, req *calendarv1.UpdateEventRequest) (*calendarv1.UpdateEventResponse, error) {
	ev, c, a, err := s.load(ctx, req.GetId())
	if err != nil {
		return nil, err
	}
	if err := requireStaff(a, c); err != nil {
		return nil, err
	}
	if ev.Status == "cancelled" || ev.Status == "held" {
		return nil, fail(connect.CodeFailedPrecondition, "not_editable", "evento %s", ev.Status)
	}
	if len([]rune(req.GetTitle())) > maxTitle || len([]rune(req.GetInternalNotes())) > maxNotes {
		return nil, fail(connect.CodeInvalidArgument, "too_long", "título o notas demasiado largos")
	}
	scope := req.GetScope()
	if scope == "" {
		scope = "this"
	}
	if scope != "this" && scope != "following" && scope != "all" {
		return nil, fail(connect.CodeInvalidArgument, "invalid_scope", "%q", scope)
	}
	if scope != "this" && ev.SeriesID == "" {
		scope = "this"
	}
	start, end := ev.Start, ev.End
	if req.Start != nil {
		start = req.GetStart().AsTime().UTC()
	}
	if req.End != nil {
		end = req.GetEnd().AsTime().UTC()
	} else if req.Start != nil {
		end = start.Add(ev.End.Sub(ev.Start))
	}
	limit := maxAppointment
	if ev.Kind == "block" {
		limit = maxBlock
	}
	if !end.After(start) || end.Sub(start) > limit {
		return nil, fail(connect.CodeInvalidArgument, "invalid_range", "fin inválido")
	}
	timeChanged := !start.Equal(ev.Start) || !end.Equal(ev.End)
	resp := &calendarv1.UpdateEventResponse{}
	err = s.Store.InTx(ctx, func(tx pgx.Tx) error {
		if err := store.LockCalendar(ctx, tx, c.ID); err != nil {
			return err
		}
		cur, err := store.GetEventForUpdate(ctx, tx, ev.ID)
		if err != nil {
			return eventErr(err)
		}
		if v := int(req.GetExpectedVersion()); v != 0 && cur.Version != v {
			return eventErr(store.ErrVersion)
		}
		if scope == "this" && req.GetRrule() == "" {
			out, err := s.updateOne(ctx, tx, c, a, cur, req, start, end, timeChanged)
			resp.Event = out
			return err
		}
		if req.GetRrule() != "" && cur.SeriesID == "" {
			return fail(connect.CodeInvalidArgument, "not_a_series", "convertir en serie: cancela y crea una serie")
		}
		out, conflicts, err := s.updateSeries(ctx, tx, c, a, cur, req, scope, start, end, timeChanged)
		resp.Event, resp.Conflicts = out, conflicts
		if len(conflicts) > 0 {
			return errRollback
		}
		return err
	})
	if err != nil && !errors.Is(err, errRollback) {
		return nil, err
	}
	if errors.Is(err, errRollback) {
		resp.Event = nil
	}
	return resp, nil
}

func textChange(req *calendarv1.UpdateEventRequest) (title, notes *string, att *store.Attendee) {
	if req.Title != nil {
		v := req.GetTitle()
		title = &v
	}
	if req.InternalNotes != nil {
		v := req.GetInternalNotes()
		notes = &v
	}
	if req.GetAttendee() != nil {
		v := attendeeOf(req.GetAttendee())
		att = &v
	}
	return title, notes, att
}

// updateOne cambia un solo evento; si es instancia de serie queda como excepción.
func (s EventServer) updateOne(ctx context.Context, tx pgx.Tx, c store.Calendar, a auth.ActorClaims, ev store.Event, req *calendarv1.UpdateEventRequest, start, end time.Time, timeChanged bool) (*calendarv1.Event, error) {
	title, notes, att := textChange(req)
	ch := store.EventChange{Title: title, InternalNotes: notes, Attendee: att}
	if timeChanged {
		ch.Start, ch.End, ch.BumpICal = &start, &end, true
		if ev.Kind == "appointment" {
			appts, blocks, err := (txOccupancy{tx: tx, now: s.Clock.Now(), exclude: ev.ID}).Load(ctx, c.ID, start.Add(-24*time.Hour), end.Add(24*time.Hour))
			if err != nil {
				return nil, err
			}
			seat, reason := pickSeat(c.Capacity, appts, blocks, start, end, minutes(ev.BufferBeforeMin), minutes(ev.BufferAfterMin))
			if reason != "" {
				return nil, slotErr(reason)
			}
			ch.Seat = &seat
		}
	}
	if ev.SeriesID != "" {
		t := true
		ch.IsException = &t
	}
	out, err := store.UpdateEvent(ctx, tx, ev.ID, ch)
	if err != nil {
		return nil, eventErr(err)
	}
	action := "updated"
	if timeChanged {
		action = "rescheduled"
	}
	var prev *store.Event
	if timeChanged {
		prev = &ev
	}
	return toProto(out, false), s.emit(ctx, tx, eventType(out, action), c, a, out, prev)
}

// updateSeries aplica el cambio desde una instancia ("following") o desde la primera futura ("all").
// Sin cambio de hora ni regla se actualizan las instancias en su sitio; con él, la serie se parte en dos.
func (s EventServer) updateSeries(ctx context.Context, tx pgx.Tx, c store.Calendar, a auth.ActorClaims, ev store.Event, req *calendarv1.UpdateEventRequest, scope string, start, end time.Time, timeChanged bool) (*calendarv1.Event, []*calendarv1.Conflict, error) {
	sr, err := store.GetSeriesForUpdate(ctx, tx, ev.SeriesID)
	if err != nil {
		return nil, nil, eventErr(err)
	}
	now := s.Clock.Now()
	pivot := ev
	if scope == "all" {
		future, err := store.SeriesEvents(ctx, tx, sr.ID, now)
		if err != nil {
			return nil, nil, err
		}
		if len(future) == 0 {
			return nil, nil, fail(connect.CodeFailedPrecondition, "series_finished", "la serie no tiene fechas futuras")
		}
		pivot = future[0]
	}
	title, notes, att := textChange(req)
	if !timeChanged && req.GetRrule() == "" {
		if title != nil {
			sr.Template.Title = *title
		}
		if notes != nil {
			sr.Template.InternalNotes = *notes
		}
		if att != nil {
			sr.Template.Attendee = *att
		}
		if err := store.UpdateSeries(ctx, tx, sr); err != nil {
			return nil, nil, err
		}
		evs, err := store.SeriesEvents(ctx, tx, sr.ID, pivot.Start)
		if err != nil {
			return nil, nil, err
		}
		var first *calendarv1.Event
		for _, it := range evs {
			if it.IsException && it.ID != ev.ID {
				continue
			}
			out, err := store.UpdateEvent(ctx, tx, it.ID, store.EventChange{Title: title, InternalNotes: notes, Attendee: att})
			if err != nil {
				return nil, nil, eventErr(err)
			}
			if first == nil {
				first = toProto(out, false)
			}
		}
		return first, nil, s.emit(ctx, tx, "series.updated", c, a, pivot, nil)
	}

	loc, err := location(sr.TZID)
	if err != nil {
		return nil, nil, err
	}
	oldRule, err := parseRule(sr.RRule)
	if err != nil {
		return nil, nil, err
	}
	// Desplazamiento de pared aplicado a la instancia editada; se aplica igual al pivote.
	evLocal := ev.Start.In(loc)
	newLocal := start.In(loc)
	shift := time.Date(newLocal.Year(), newLocal.Month(), newLocal.Day(), newLocal.Hour(), newLocal.Minute(), 0, 0, time.UTC).
		Sub(time.Date(evLocal.Year(), evLocal.Month(), evLocal.Day(), evLocal.Hour(), evLocal.Minute(), 0, 0, time.UTC))
	pivotWall := wall(localStart(pivot.Start, loc)).Add(shift)
	newRule := oldRule
	if r := req.GetRrule(); r != "" {
		if newRule, err = parseRule(r); err != nil {
			return nil, nil, err
		}
	} else if oldRule.Count > 0 {
		before := recurrence.Expand(oldRule, startOf(sr.DTStartLocal), loc, time.Minute, pivot.Start.Add(-time.Second), nil)
		newRule.Count = max(oldRule.Count-len(before), 1)
	}
	// Cierra la serie vieja antes del pivote y cancela sus instancias desde ahí (salvo excepciones).
	until := pivot.Start.Add(-time.Second)
	sr.UntilUTC = &until
	if err := store.UpdateSeries(ctx, tx, sr); err != nil {
		return nil, nil, err
	}
	olds, err := store.SeriesEvents(ctx, tx, sr.ID, pivot.Start)
	if err != nil {
		return nil, nil, err
	}
	status, reason := "cancelled", "series_changed"
	for _, it := range olds {
		if it.IsException && it.ID != ev.ID {
			continue
		}
		if _, err := store.UpdateEvent(ctx, tx, it.ID, store.EventChange{Status: &status, CancelReason: &reason, BumpICal: true, Now: now}); err != nil {
			return nil, nil, eventErr(err)
		}
	}
	tpl := sr.Template
	if title != nil {
		tpl.Title = *title
	}
	if notes != nil {
		tpl.InternalNotes = *notes
	}
	if att != nil {
		tpl.Attendee = *att
	}
	if newRule.Until.IsZero() && newRule.Count == 0 && oldRule.Until.After(pivot.Start) {
		newRule.Until = oldRule.Until // la regla nueva sin fin propio hereda el de la vieja
	}
	ns, err := store.InsertSeries(ctx, tx, store.Series{
		CalendarID: c.ID, Kind: sr.Kind, RRule: newRule.String(), DTStartLocal: pivotWall, TZID: sr.TZID,
		DurationMin: int(end.Sub(start) / time.Minute), MaterializedUntil: now, Template: tpl, CreatedBy: a.UserID,
	})
	if err != nil {
		return nil, nil, err
	}
	evs, conflicts, err := s.materialize(ctx, tx, c, &ns, time.Time{}, now.Add(SeriesHorizon))
	if err != nil || len(conflicts) > 0 {
		return nil, conflicts, err
	}
	if len(evs) == 0 {
		return nil, nil, fail(connect.CodeInvalidArgument, "empty_series", "la regla nueva no produce fechas futuras")
	}
	return toProto(evs[0], false), nil, s.emit(ctx, tx, "series.updated", c, a, evs[0], &pivot)
}

// CancelEvent cancela un evento, o una serie desde una instancia ("following") o desde hoy ("all").
func (s EventServer) CancelEvent(ctx context.Context, req *calendarv1.CancelEventRequest) (*calendarv1.CancelEventResponse, error) {
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
	if ev.Status != "confirmed" {
		return nil, fail(connect.CodeFailedPrecondition, "not_cancellable", "evento %s", ev.Status)
	}
	if err := s.cancellationAllowed(a, c, ev); err != nil {
		return nil, err
	}
	scope := req.GetScope()
	if scope == "" || ev.SeriesID == "" {
		scope = "this"
	}
	if scope != "this" && scope != "following" && scope != "all" {
		return nil, fail(connect.CodeInvalidArgument, "invalid_scope", "%q", scope)
	}
	if customer && scope != "this" {
		return nil, fail(connect.CodePermissionDenied, "permission_denied", "un cliente final cancela de una en una")
	}
	if len([]rune(req.GetReason())) > maxNotes {
		return nil, fail(connect.CodeInvalidArgument, "too_long", "motivo demasiado largo")
	}
	resp := &calendarv1.CancelEventResponse{}
	err = s.Store.InTx(ctx, func(tx pgx.Tx) error {
		now := s.Clock.Now()
		status, reason := "cancelled", req.GetReason()
		cancel := func(id string, version int) (store.Event, error) {
			out, err := store.UpdateEvent(ctx, tx, id, store.EventChange{Status: &status, CancelReason: &reason, BumpICal: true,
				ExpectedVersion: version, Now: now})
			if err != nil {
				return out, eventErr(err)
			}
			resp.Cancelled = append(resp.Cancelled, toProto(out, customer))
			return out, nil
		}
		if scope == "this" {
			out, err := cancel(ev.ID, int(req.GetExpectedVersion()))
			if err != nil {
				return err
			}
			if ev.SeriesID != "" {
				sr, err := store.GetSeriesForUpdate(ctx, tx, ev.SeriesID)
				if err != nil {
					return err
				}
				sr.ExdatesLocal = append(sr.ExdatesLocal, ev.RecurrenceID.UTC())
				if err := store.UpdateSeries(ctx, tx, sr); err != nil {
					return err
				}
			}
			return s.emit(ctx, tx, eventType(out, "cancelled"), c, a, out, nil)
		}
		sr, err := store.GetSeriesForUpdate(ctx, tx, ev.SeriesID)
		if err != nil {
			return err
		}
		pivot := ev.Start
		if scope == "all" {
			pivot = now
		}
		until := pivot.Add(-time.Second)
		sr.UntilUTC = &until
		if err := store.UpdateSeries(ctx, tx, sr); err != nil {
			return err
		}
		evs, err := store.SeriesEvents(ctx, tx, sr.ID, pivot)
		if err != nil {
			return err
		}
		for _, it := range evs {
			if _, err := cancel(it.ID, 0); err != nil {
				return err
			}
		}
		return s.emit(ctx, tx, "series.cancelled", c, a, ev, nil)
	})
	if err != nil {
		return nil, err
	}
	return resp, nil
}

// ExtendSeries materializa las series cuyo horizonte quedó corto (job diario).
func (e *Engine) ExtendSeries(ctx context.Context) (int, error) {
	now := e.Clock.Now()
	horizon := now.Add(SeriesHorizon)
	total := 0
	for {
		list, err := store.SeriesToExtend(ctx, e.Store.Pool, horizon.Add(-24*time.Hour), 50)
		if err != nil || len(list) == 0 {
			return total, err
		}
		for _, item := range list {
			c, err := e.Store.GetCalendar(ctx, item.CalendarID)
			if err != nil {
				return total, err
			}
			err = e.Store.InTx(ctx, func(tx pgx.Tx) error {
				if err := store.LockCalendar(ctx, tx, item.CalendarID); err != nil {
					return err
				}
				sr, err := store.GetSeriesForUpdate(ctx, tx, item.ID)
				if err != nil {
					return err
				}
				evs, conflicts, err := e.materialize(ctx, tx, c, &sr, sr.MaterializedUntil, horizon)
				if err != nil {
					return err
				}
				total += len(evs)
				if len(conflicts) > 0 && len(evs) > 0 {
					return e.emit(ctx, tx, "series.instances_skipped", c, auth.ActorClaims{Role: "system", Via: "system"}, evs[0], nil)
				}
				return nil
			})
			if err != nil {
				return total, err
			}
		}
	}
}
