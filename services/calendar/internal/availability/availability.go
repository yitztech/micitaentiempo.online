// Package availability calcula los horarios libres de un tablero. Es una función pura:
// sin base de datos, sin red y con el reloj como entrada (docs/plan/04-motor-calendario.md §4.4).
package availability

import (
	"slices"
	"time"

	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
)

// MaxWindow es el rango máximo de una consulta.
const MaxWindow = 62 * 24 * time.Hour

// ShiftKind distingue horario abierto y descansos.
type ShiftKind int

// Tipos de turno semanal.
const (
	Open ShiftKind = iota
	Break
)

// ClockRange es un tramo de hora de pared [Start, End).
type ClockRange struct {
	Start, End domain.Clock
}

// Shift es un tramo del horario semanal.
type Shift struct {
	Kind  ShiftKind
	Range ClockRange
	Label string
}

// OverrideKind es el tipo de excepción de una fecha.
type OverrideKind int

// Tipos de excepción.
const (
	Closed OverrideKind = iota
	Custom
	OpenOnHoliday
)

// Override cambia el horario de una fecha concreta.
type Override struct {
	Kind      OverrideKind
	Intervals []ClockRange
}

// Service son los parámetros del tipo de cita.
type Service struct {
	ID             string
	Duration       time.Duration
	BufferBefore   time.Duration
	BufferAfter    time.Duration
	MinNotice      time.Duration
	MaxAdvanceDays int
	Step           time.Duration
	DailyLimit     int
}

// Appointment es una cita (confirmada o en hold) que ocupa un asiento.
type Appointment struct {
	ID           string
	Interval     domain.Interval
	Seat         int
	ServiceID    string
	BufferBefore time.Duration
	BufferAfter  time.Duration
}

// Input reúne todo lo necesario para calcular huecos.
type Input struct {
	Location *time.Location
	Capacity int
	// Weekly por día ISO (1 = lunes … 7 = domingo).
	Weekly    map[int][]Shift
	Overrides map[domain.Date]Override
	// Holidays: fechas locales bloqueadas por feriados (ya resueltas por políticas).
	Holidays map[domain.Date]bool
	// Appointments: citas y holds vigentes.
	Appointments []Appointment
	// Blocks: bloqueos y ocupado externo; ocupan todos los asientos.
	Blocks  []domain.Interval
	Service Service
	Now     time.Time
	From    time.Time
	To      time.Time
}

// Slot es un horario reservable.
type Slot struct {
	Start     time.Time
	End       time.Time
	SeatsFree int
}

// Compute devuelve los horarios libres ordenados.
func Compute(in Input) []Slot {
	if in.Location == nil || in.Service.Duration <= 0 || in.Capacity < 1 {
		return nil
	}
	start, end := window(in)
	if !end.After(start) {
		return nil
	}
	step := in.Service.Step
	if step <= 0 {
		step = in.Service.Duration
	}
	stepMin := int(step / time.Minute)
	if stepMin < 1 {
		stepMin = 1
	}

	var slots []Slot
	first, last := domain.DateOf(start.In(in.Location)), domain.DateOf(end.In(in.Location))
	for d := first; !d.After(last); d = d.AddDays(1) {
		if in.Service.DailyLimit > 0 && bookedOn(in, d) >= in.Service.DailyLimit {
			continue
		}
		for _, r := range dayRanges(in, d) {
			open := toInterval(d, r, in.Location)
			if open.Empty() {
				continue
			}
			g := ((int(r.Start) + stepMin - 1) / stepMin) * stepMin
			for ; g < int(r.End); g += stepMin {
				s, exists := domain.Resolve(d, domain.Clock(g), in.Location)
				if !exists || s.Before(open.Start) {
					continue
				}
				e := s.Add(in.Service.Duration)
				if e.After(open.End) {
					break
				}
				if s.Before(start) || !s.Before(end) {
					continue
				}
				if free := seatsFree(in, s, e); free > 0 {
					slots = append(slots, Slot{Start: s, End: e, SeatsFree: free})
				}
			}
		}
	}
	slices.SortFunc(slots, func(a, b Slot) int { return a.Start.Compare(b.Start) })
	return slices.CompactFunc(slots, func(a, b Slot) bool { return a.Start.Equal(b.Start) })
}

// window aplica antelación mínima, ventana máxima y tope de consulta.
func window(in Input) (time.Time, time.Time) {
	start := in.From
	if earliest := in.Now.Add(in.Service.MinNotice); earliest.After(start) {
		start = earliest
	}
	end := in.To
	if in.Service.MaxAdvanceDays > 0 {
		if latest := in.Now.AddDate(0, 0, in.Service.MaxAdvanceDays); latest.Before(end) {
			end = latest
		}
	}
	if capEnd := in.From.Add(MaxWindow); capEnd.Before(end) {
		end = capEnd
	}
	return start.UTC(), end.UTC()
}

// dayRanges devuelve los tramos abiertos de una fecha local (excepciones, feriados y descansos).
func dayRanges(in Input, d domain.Date) []ClockRange {
	ov, hasOv := in.Overrides[d]
	switch {
	case hasOv && ov.Kind == Closed:
		return nil
	case hasOv && ov.Kind == Custom:
		return mergeRanges(ov.Intervals)
	case in.Holidays[d] && (!hasOv || ov.Kind != OpenOnHoliday):
		return nil
	}
	var open, breaks []ClockRange
	for _, s := range in.Weekly[d.ISOWeekday()] {
		if s.Kind == Open {
			open = append(open, s.Range)
		} else {
			breaks = append(breaks, s.Range)
		}
	}
	return subtractRanges(mergeRanges(open), breaks)
}

func toInterval(d domain.Date, r ClockRange, loc *time.Location) domain.Interval {
	s, _ := domain.Resolve(d, r.Start, loc)
	var e time.Time
	if r.End >= 24*60 {
		e, _ = domain.Resolve(d.AddDays(1), 0, loc)
	} else {
		e, _ = domain.Resolve(d, r.End, loc)
	}
	return domain.Interval{Start: s, End: e}
}

// seatsFree cuenta asientos libres para [s, e) con los márgenes de cada cita.
func seatsFree(in Input, s, e time.Time) int {
	want := domain.Interval{Start: s.Add(-in.Service.BufferBefore), End: e.Add(in.Service.BufferAfter)}
	for _, b := range in.Blocks {
		if b.Overlaps(want) {
			return 0
		}
	}
	used := map[int]bool{}
	for _, a := range in.Appointments {
		occupied := domain.Interval{Start: a.Interval.Start.Add(-a.BufferBefore), End: a.Interval.End.Add(a.BufferAfter)}
		if occupied.Overlaps(want) {
			used[a.Seat] = true
		}
	}
	return max(in.Capacity-len(used), 0)
}

func bookedOn(in Input, d domain.Date) int {
	n := 0
	for _, a := range in.Appointments {
		if a.ServiceID == in.Service.ID && domain.DateOf(a.Interval.Start.In(in.Location)) == d {
			n++
		}
	}
	return n
}

func mergeRanges(rs []ClockRange) []ClockRange {
	xs := slices.Clone(rs)
	slices.SortFunc(xs, func(a, b ClockRange) int { return int(a.Start) - int(b.Start) })
	var out []ClockRange
	for _, r := range xs {
		if r.End <= r.Start {
			continue
		}
		if n := len(out); n > 0 && r.Start <= out[n-1].End {
			out[n-1].End = max(out[n-1].End, r.End)
			continue
		}
		out = append(out, r)
	}
	return out
}

func subtractRanges(set, cut []ClockRange) []ClockRange {
	out := set
	for _, c := range cut {
		var next []ClockRange
		for _, s := range out {
			if c.End <= s.Start || c.Start >= s.End {
				next = append(next, s)
				continue
			}
			if s.Start < c.Start {
				next = append(next, ClockRange{s.Start, c.Start})
			}
			if c.End < s.End {
				next = append(next, ClockRange{c.End, s.End})
			}
		}
		out = next
	}
	return out
}
