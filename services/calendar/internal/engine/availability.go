package engine

import (
	"context"
	"errors"
	"time"

	"connectrpc.com/connect"
	calendarv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/calendar/v1"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/availability"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/holidays"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/store"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// AvailabilityServer implementa mcet.calendar.v1.AvailabilityService.
type AvailabilityServer struct{ *Engine }

// Occupancy aporta citas y bloqueos de un rango (la añade F5; nil = sin ocupación).
type Occupancy interface {
	Load(ctx context.Context, calendarID string, from, to time.Time) ([]availability.Appointment, []domain.Interval, error)
}

// BuildInput reúne todo lo que necesita el cálculo de huecos de un tablero y servicio.
func (e *Engine) BuildInput(ctx context.Context, c store.Calendar, sv store.Service, from, to time.Time, occ Occupancy) (availability.Input, error) {
	loc, err := location(c.Timezone)
	if err != nil {
		return availability.Input{}, err
	}
	sc, err := e.Store.GetSchedule(ctx, c.ID)
	if err != nil {
		return availability.Input{}, err
	}
	in := availability.Input{
		Location: loc, Capacity: c.Capacity, Weekly: map[int][]availability.Shift{},
		Overrides: map[domain.Date]availability.Override{}, Now: e.Clock.Now(), From: from, To: to,
		Service: availability.Service{
			ID: sv.ID, Duration: minutes(sv.DurationMin), BufferBefore: minutes(sv.BufferBeforeMin),
			BufferAfter: minutes(sv.BufferAfterMin), MinNotice: minutes(sv.MinNoticeMin),
			MaxAdvanceDays: sv.MaxAdvanceDays, Step: minutes(sv.SlotStepMin), DailyLimit: sv.DailyLimit,
		},
	}
	for _, sh := range sc.Shifts {
		a, _ := domain.ParseClock(sh.StartLocal)
		b, _ := domain.ParseClock(sh.EndLocal)
		kind := availability.Open
		if sh.Kind == "break" {
			kind = availability.Break
		}
		in.Weekly[sh.Weekday] = append(in.Weekly[sh.Weekday], availability.Shift{Kind: kind, Range: availability.ClockRange{Start: a, End: b}, Label: sh.Label})
	}
	for _, o := range sc.Overrides {
		d, err := domain.ParseDate(o.Date)
		if err != nil {
			continue
		}
		ov := availability.Override{}
		switch o.Kind {
		case "closed":
			ov.Kind = availability.Closed
		case "open_on_holiday":
			ov.Kind = availability.OpenOnHoliday
		default:
			ov.Kind = availability.Custom
			for _, r := range o.Intervals {
				a, _ := domain.ParseClock(r.Start)
				b, _ := domain.ParseClock(r.End)
				ov.Intervals = append(ov.Intervals, availability.ClockRange{Start: a, End: b})
			}
		}
		in.Overrides[d] = ov
	}
	ps, cs := policiesOf(sc)
	first, last := domain.DateOf(from.In(loc)).AddDays(-1), domain.DateOf(to.In(loc)).AddDays(1)
	ms, err := e.Holidays.Resolve(ps, cs, first, last)
	if err != nil && !errors.Is(err, holidays.ErrUnknownCountry) {
		return in, err
	}
	in.Holidays = holidays.Dates(ms)
	if occ != nil {
		appts, blocks, err := occ.Load(ctx, c.ID, from.Add(-24*time.Hour), to.Add(24*time.Hour))
		if err != nil {
			return in, err
		}
		in.Appointments, in.Blocks = appts, blocks
	}
	return in, nil
}

func minutes(n int) time.Duration { return time.Duration(n) * time.Minute }

// GetSlots devuelve los horarios libres; a un cliente final nunca se le dice quién ocupa un horario.
func (s AvailabilityServer) GetSlots(ctx context.Context, req *calendarv1.GetSlotsRequest) (*calendarv1.GetSlotsResponse, error) {
	c, _, err := s.calendar(ctx, req.GetCalendarId(), false)
	if err != nil {
		return nil, err
	}
	if c.Status != "active" {
		return nil, fail(connect.CodeFailedPrecondition, "calendar_archived", "tablero archivado")
	}
	sv, err := s.Store.GetService(ctx, c.ID, req.GetServiceId())
	if errors.Is(err, store.ErrNotFound) || (err == nil && !sv.Active) {
		return nil, fail(connect.CodeNotFound, "service_not_found", "servicio %s", req.GetServiceId())
	}
	if err != nil {
		return nil, err
	}
	if req.GetFrom() == nil || req.GetTo() == nil {
		return nil, fail(connect.CodeInvalidArgument, "invalid_range", "faltan desde y hasta")
	}
	from, to := req.GetFrom().AsTime(), req.GetTo().AsTime()
	if !to.After(from) || to.Sub(from) > availability.MaxWindow {
		return nil, fail(connect.CodeInvalidArgument, "invalid_range", "rango de 1 minuto a 62 días")
	}
	s.freshBusy(ctx, c.ID, false)
	in, err := s.BuildInput(ctx, c, sv, from, to, s.Occupancy)
	if err != nil {
		return nil, err
	}
	out := &calendarv1.GetSlotsResponse{Timezone: c.Timezone}
	for _, sl := range availability.Compute(in) {
		out.Slots = append(out.Slots, &calendarv1.Slot{Start: timestamppb.New(sl.Start), End: timestamppb.New(sl.End), SeatsFree: int32(sl.SeatsFree)}) //nolint:gosec // ≤ 50
	}
	return out, nil
}
