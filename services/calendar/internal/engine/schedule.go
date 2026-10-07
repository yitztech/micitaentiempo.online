package engine

import (
	"context"
	"slices"

	"connectrpc.com/connect"
	calendarv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/calendar/v1"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/holidays"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/store"
)

// ScheduleServer implementa mcet.calendar.v1.ScheduleService.
type ScheduleServer struct{ *Engine }

func toProtoSchedule(s store.Schedule) *calendarv1.Schedule {
	out := &calendarv1.Schedule{CalendarId: s.CalendarID}
	for _, sh := range s.Shifts {
		out.Shifts = append(out.Shifts, &calendarv1.Shift{
			Weekday: int32(sh.Weekday), Kind: sh.Kind, Label: sh.Label, //nolint:gosec // 1…7
			Range: &calendarv1.TimeRange{Start: sh.StartLocal, End: sh.EndLocal},
		})
	}
	for _, o := range s.Overrides {
		po := &calendarv1.DateOverride{Date: o.Date, Kind: o.Kind, Note: o.Note}
		for _, r := range o.Intervals {
			po.Intervals = append(po.Intervals, &calendarv1.TimeRange{Start: r.Start, End: r.End})
		}
		out.Overrides = append(out.Overrides, po)
	}
	for _, p := range s.Policies {
		out.HolidayPolicies = append(out.HolidayPolicies, &calendarv1.HolidayPolicy{
			Country: p.Country, Subdivision: p.Subdivision, Types: p.Types, Substitutes: p.Substitutes,
		})
	}
	for _, c := range s.Customs {
		out.CustomHolidays = append(out.CustomHolidays, &calendarv1.CustomHoliday{Id: c.ID, Name: c.Name, Date: c.Date, MonthDay: c.MonthDay})
	}
	return out
}

func validRange(r *calendarv1.TimeRange) (domain.Clock, domain.Clock, error) {
	a, err := domain.ParseClock(r.GetStart())
	if err != nil {
		return 0, 0, fail(connect.CodeInvalidArgument, "invalid_time", "%v", err)
	}
	b, err := domain.ParseClock(r.GetEnd())
	if err != nil {
		return 0, 0, fail(connect.CodeInvalidArgument, "invalid_time", "%v", err)
	}
	if b <= a || a >= 24*60 {
		return 0, 0, fail(connect.CodeInvalidArgument, "invalid_range", "%s-%s", r.GetStart(), r.GetEnd())
	}
	return a, b, nil
}

func (s ScheduleServer) schedule(ctx context.Context, id string) (*calendarv1.Schedule, error) {
	sc, err := s.Store.GetSchedule(ctx, id)
	if err != nil {
		return nil, err
	}
	return toProtoSchedule(sc), nil
}

// GetSchedule devuelve la configuración horaria (datos públicos del tablero).
func (s ScheduleServer) GetSchedule(ctx context.Context, req *calendarv1.GetScheduleRequest) (*calendarv1.Schedule, error) {
	if _, _, err := s.calendar(ctx, req.GetCalendarId(), false); err != nil {
		return nil, err
	}
	return s.schedule(ctx, req.GetCalendarId())
}

// SetWeeklyHours sustituye el horario semanal y los descansos.
func (s ScheduleServer) SetWeeklyHours(ctx context.Context, req *calendarv1.SetWeeklyHoursRequest) (*calendarv1.Schedule, error) {
	if _, _, err := s.calendar(ctx, req.GetCalendarId(), true); err != nil {
		return nil, err
	}
	if len(req.GetShifts()) > 70 {
		return nil, fail(connect.CodeInvalidArgument, "too_many_shifts", "máximo 70 tramos")
	}
	var shifts []store.Shift
	for _, sh := range req.GetShifts() {
		if sh.GetWeekday() < 1 || sh.GetWeekday() > 7 || (sh.GetKind() != "open" && sh.GetKind() != "break") {
			return nil, fail(connect.CodeInvalidArgument, "invalid_shift", "día %d tipo %q", sh.GetWeekday(), sh.GetKind())
		}
		if _, _, err := validRange(sh.GetRange()); err != nil {
			return nil, err
		}
		shifts = append(shifts, store.Shift{
			Weekday: int(sh.GetWeekday()), Kind: sh.GetKind(), Label: sh.GetLabel(),
			StartLocal: sh.GetRange().GetStart(), EndLocal: sh.GetRange().GetEnd(),
		})
	}
	if err := s.Store.ReplaceShifts(ctx, req.GetCalendarId(), shifts); err != nil {
		return nil, err
	}
	return s.schedule(ctx, req.GetCalendarId())
}

// UpsertDateOverride crea o cambia la excepción de una fecha.
func (s ScheduleServer) UpsertDateOverride(ctx context.Context, req *calendarv1.UpsertDateOverrideRequest) (*calendarv1.Schedule, error) {
	if _, _, err := s.calendar(ctx, req.GetCalendarId(), true); err != nil {
		return nil, err
	}
	o := req.GetOverride()
	if _, err := domain.ParseDate(o.GetDate()); err != nil {
		return nil, fail(connect.CodeInvalidArgument, "invalid_date", "%v", err)
	}
	so := store.DateOverride{Date: o.GetDate(), Kind: o.GetKind(), Note: o.GetNote()}
	switch o.GetKind() {
	case "closed", "open_on_holiday":
	case "custom":
		if len(o.GetIntervals()) == 0 {
			return nil, fail(connect.CodeInvalidArgument, "invalid_override", "horario especial sin tramos")
		}
		for _, r := range o.GetIntervals() {
			if _, _, err := validRange(r); err != nil {
				return nil, err
			}
			so.Intervals = append(so.Intervals, store.TimeRange{Start: r.GetStart(), End: r.GetEnd()})
		}
	default:
		return nil, fail(connect.CodeInvalidArgument, "invalid_override", "tipo %q", o.GetKind())
	}
	if err := s.Store.UpsertOverride(ctx, req.GetCalendarId(), so); err != nil {
		return nil, err
	}
	return s.schedule(ctx, req.GetCalendarId())
}

// DeleteDateOverride quita la excepción de una fecha.
func (s ScheduleServer) DeleteDateOverride(ctx context.Context, req *calendarv1.DeleteDateOverrideRequest) (*calendarv1.Schedule, error) {
	if _, _, err := s.calendar(ctx, req.GetCalendarId(), true); err != nil {
		return nil, err
	}
	if _, err := domain.ParseDate(req.GetDate()); err != nil {
		return nil, fail(connect.CodeInvalidArgument, "invalid_date", "%v", err)
	}
	if err := s.Store.DeleteOverride(ctx, req.GetCalendarId(), req.GetDate()); err != nil {
		return nil, err
	}
	return s.schedule(ctx, req.GetCalendarId())
}

// SetHolidayPolicies fija qué feriados bloquean el tablero (uno o varios países).
func (s ScheduleServer) SetHolidayPolicies(ctx context.Context, req *calendarv1.SetHolidayPoliciesRequest) (*calendarv1.Schedule, error) {
	if _, _, err := s.calendar(ctx, req.GetCalendarId(), true); err != nil {
		return nil, err
	}
	var ps []store.HolidayPolicy
	for _, p := range req.GetPolicies() {
		if !s.Holidays.HasCountry(p.GetCountry(), p.GetSubdivision()) {
			return nil, fail(connect.CodeInvalidArgument, "invalid_country", "%s %s", p.GetCountry(), p.GetSubdivision())
		}
		types := p.GetTypes()
		if len(types) == 0 {
			types = []string{"public"}
		}
		for _, t := range types {
			if !slices.Contains(holidays.Types, t) {
				return nil, fail(connect.CodeInvalidArgument, "invalid_holiday_type", "%q", t)
			}
		}
		ps = append(ps, store.HolidayPolicy{Country: p.GetCountry(), Subdivision: p.GetSubdivision(), Types: types, Substitutes: p.GetSubstitutes()})
	}
	if err := s.Store.ReplacePolicies(ctx, req.GetCalendarId(), ps); err != nil {
		return nil, err
	}
	return s.schedule(ctx, req.GetCalendarId())
}

// UpsertCustomHoliday crea o cambia un feriado propio.
func (s ScheduleServer) UpsertCustomHoliday(ctx context.Context, req *calendarv1.UpsertCustomHolidayRequest) (*calendarv1.Schedule, error) {
	if _, _, err := s.calendar(ctx, req.GetCalendarId(), true); err != nil {
		return nil, err
	}
	h := req.GetHoliday()
	if l := len([]rune(h.GetName())); l < 1 || l > 120 {
		return nil, fail(connect.CodeInvalidArgument, "invalid_name", "nombre de 1 a 120 caracteres")
	}
	if (h.GetDate() == "") == (h.GetMonthDay() == "") {
		return nil, fail(connect.CodeInvalidArgument, "invalid_holiday", "indica una fecha o un día de cada año")
	}
	if h.GetDate() != "" {
		if _, err := domain.ParseDate(h.GetDate()); err != nil {
			return nil, fail(connect.CodeInvalidArgument, "invalid_date", "%v", err)
		}
	} else if _, err := domain.ParseDate("2024-" + h.GetMonthDay()); err != nil {
		return nil, fail(connect.CodeInvalidArgument, "invalid_date", "%q", h.GetMonthDay())
	}
	if _, err := s.Store.UpsertCustom(ctx, req.GetCalendarId(), store.CustomHoliday{ID: h.GetId(), Name: h.GetName(), Date: h.GetDate(), MonthDay: h.GetMonthDay()}); err != nil {
		return nil, storeErr(err)
	}
	return s.schedule(ctx, req.GetCalendarId())
}

// DeleteCustomHoliday borra un feriado propio.
func (s ScheduleServer) DeleteCustomHoliday(ctx context.Context, req *calendarv1.DeleteCustomHolidayRequest) (*calendarv1.Schedule, error) {
	if _, _, err := s.calendar(ctx, req.GetCalendarId(), true); err != nil {
		return nil, err
	}
	if err := s.Store.DeleteCustom(ctx, req.GetCalendarId(), req.GetId()); err != nil {
		return nil, err
	}
	return s.schedule(ctx, req.GetCalendarId())
}

func policiesOf(sc store.Schedule) ([]holidays.Policy, []holidays.Custom) {
	var ps []holidays.Policy
	for _, p := range sc.Policies {
		ps = append(ps, holidays.Policy{Country: p.Country, Subdivision: p.Subdivision, Types: p.Types, Substitutes: p.Substitutes})
	}
	var cs []holidays.Custom
	for _, c := range sc.Customs {
		hc := holidays.Custom{Name: c.Name, MonthDay: c.MonthDay}
		if c.Date != "" {
			if d, err := domain.ParseDate(c.Date); err == nil {
				hc.Date = &d
			}
		}
		cs = append(cs, hc)
	}
	return ps, cs
}

// ListHolidays devuelve los feriados que aplican en un rango, con su nombre en el idioma pedido.
func (s ScheduleServer) ListHolidays(ctx context.Context, req *calendarv1.ListHolidaysRequest) (*calendarv1.ListHolidaysResponse, error) {
	if _, _, err := s.calendar(ctx, req.GetCalendarId(), false); err != nil {
		return nil, err
	}
	from, err := domain.ParseDate(req.GetFrom())
	if err != nil {
		return nil, fail(connect.CodeInvalidArgument, "invalid_date", "%v", err)
	}
	to, err := domain.ParseDate(req.GetTo())
	if err != nil {
		return nil, fail(connect.CodeInvalidArgument, "invalid_date", "%v", err)
	}
	if to.Before(from) || from.AddDays(400).Before(to) {
		return nil, fail(connect.CodeInvalidArgument, "invalid_range", "máximo 400 días")
	}
	sc, err := s.Store.GetSchedule(ctx, req.GetCalendarId())
	if err != nil {
		return nil, err
	}
	ps, cs := policiesOf(sc)
	ms, err := s.Holidays.Resolve(ps, cs, from, to)
	if err != nil {
		return nil, err
	}
	open := map[string]bool{}
	for _, o := range sc.Overrides {
		if o.Kind == "open_on_holiday" {
			open[o.Date] = true
		}
	}
	lang := req.GetLocale()
	if lang != "en" {
		lang = "es"
	}
	out := &calendarv1.ListHolidaysResponse{}
	for _, m := range ms {
		name := m.Names[lang]
		if name == "" {
			name = m.Names["es"]
		}
		out.Holidays = append(out.Holidays, &calendarv1.Holiday{Date: m.Date.String(), Name: name, Source: m.Source, Type: m.Type, Open: open[m.Date.String()]})
	}
	return out, nil
}

// ListCountries devuelve los países y regiones con datos de feriados.
func (s ScheduleServer) ListCountries(ctx context.Context, req *calendarv1.ListCountriesRequest) (*calendarv1.ListCountriesResponse, error) {
	if _, err := actorOf(ctx); err != nil {
		return nil, err
	}
	lang := req.GetLocale()
	if lang != "en" {
		lang = "es"
	}
	out := &calendarv1.ListCountriesResponse{}
	for _, y := range s.Holidays.Years() {
		out.Years = append(out.Years, int32(y)) //nolint:gosec // años
	}
	for _, c := range s.Holidays.Countries(lang) {
		pc := &calendarv1.Country{Code: c.Code, Name: c.Names[lang]}
		for _, sd := range c.Subdivisions {
			pc.Subdivisions = append(pc.Subdivisions, &calendarv1.Subdivision{Code: sd.Code, Name: sd.Names[lang]})
		}
		out.Countries = append(out.Countries, pc)
	}
	return out, nil
}
