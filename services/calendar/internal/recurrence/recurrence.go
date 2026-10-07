// Package recurrence implementa el subconjunto de RRULE (RFC 5545) que ofrece la interfaz:
// FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, BYDAY (con ordinal en MONTHLY/YEARLY), BYMONTHDAY,
// BYMONTH, COUNT, UNTIL y WKST=MO. La expansión es en hora de pared: «cada martes a las 10:00»
// sigue a las 10:00 tras un cambio de horario (docs/plan/04-motor-calendario.md §4.5).
package recurrence

import (
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
)

// Freq es la frecuencia de la regla.
type Freq int

// Frecuencias admitidas.
const (
	Daily Freq = iota + 1
	Weekly
	Monthly
	Yearly
)

var freqNames = map[Freq]string{Daily: "DAILY", Weekly: "WEEKLY", Monthly: "MONTHLY", Yearly: "YEARLY"}

// MaxCount limita las repeticiones de una serie.
const MaxCount = 730

// WeekdayNum es un día de la semana con ordinal opcional (2TU = segundo martes; -1FR = último viernes).
type WeekdayNum struct {
	Day time.Weekday
	N   int
}

// Rule es una regla de recurrencia validada.
type Rule struct {
	Freq       Freq
	Interval   int
	ByDay      []WeekdayNum
	ByMonthDay []int
	ByMonth    []time.Month
	Count      int
	Until      time.Time
}

// ErrUnsupported indica una parte de RRULE fuera del subconjunto.
var ErrUnsupported = errors.New("parte de RRULE no admitida")

var dayCodes = map[string]time.Weekday{"MO": time.Monday, "TU": time.Tuesday, "WE": time.Wednesday, "TH": time.Thursday, "FR": time.Friday, "SA": time.Saturday, "SU": time.Sunday}

func dayCode(d time.Weekday) string {
	for k, v := range dayCodes {
		if v == d {
			return k
		}
	}
	return ""
}

// Parse lee una RRULE (con o sin el prefijo "RRULE:") y la valida.
func Parse(s string) (Rule, error) {
	s = strings.TrimPrefix(strings.TrimSpace(s), "RRULE:")
	r := Rule{Interval: 1}
	seen := map[string]bool{}
	for _, part := range strings.Split(s, ";") {
		k, v, ok := strings.Cut(part, "=")
		if !ok || v == "" {
			return Rule{}, fmt.Errorf("parte mal formada %q", part)
		}
		k = strings.ToUpper(k)
		if seen[k] {
			return Rule{}, fmt.Errorf("parte repetida %q", k)
		}
		seen[k] = true
		switch k {
		case "FREQ":
			for f, name := range freqNames {
				if name == strings.ToUpper(v) {
					r.Freq = f
				}
			}
			if r.Freq == 0 {
				return Rule{}, fmt.Errorf("%w: FREQ=%s", ErrUnsupported, v)
			}
		case "INTERVAL":
			n, err := strconv.Atoi(v)
			if err != nil {
				return Rule{}, fmt.Errorf("INTERVAL: %w", err)
			}
			r.Interval = n
		case "COUNT":
			n, err := strconv.Atoi(v)
			if err != nil {
				return Rule{}, fmt.Errorf("COUNT: %w", err)
			}
			r.Count = n
		case "UNTIL":
			t, err := time.Parse("20060102T150405Z", v)
			if err != nil {
				return Rule{}, fmt.Errorf("UNTIL debe ser UTC (AAAAMMDDTHHMMSSZ): %w", err)
			}
			r.Until = t
		case "BYDAY":
			for _, d := range strings.Split(v, ",") {
				d = strings.ToUpper(d)
				if len(d) < 2 {
					return Rule{}, fmt.Errorf("BYDAY %q", d)
				}
				wd, ok := dayCodes[d[len(d)-2:]]
				if !ok {
					return Rule{}, fmt.Errorf("BYDAY %q", d)
				}
				n := 0
				if prefix := d[:len(d)-2]; prefix != "" {
					var err error
					if n, err = strconv.Atoi(prefix); err != nil {
						return Rule{}, fmt.Errorf("BYDAY %q", d)
					}
				}
				r.ByDay = append(r.ByDay, WeekdayNum{Day: wd, N: n})
			}
		case "BYMONTHDAY":
			for _, x := range strings.Split(v, ",") {
				n, err := strconv.Atoi(x)
				if err != nil {
					return Rule{}, fmt.Errorf("BYMONTHDAY %q", x)
				}
				r.ByMonthDay = append(r.ByMonthDay, n)
			}
		case "BYMONTH":
			for _, x := range strings.Split(v, ",") {
				n, err := strconv.Atoi(x)
				if err != nil || n < 1 || n > 12 {
					return Rule{}, fmt.Errorf("BYMONTH %q", x)
				}
				r.ByMonth = append(r.ByMonth, time.Month(n))
			}
		case "WKST":
			if strings.ToUpper(v) != "MO" {
				return Rule{}, fmt.Errorf("%w: WKST=%s (solo MO)", ErrUnsupported, v)
			}
		default:
			return Rule{}, fmt.Errorf("%w: %s", ErrUnsupported, k)
		}
	}
	return r, r.Validate()
}

// Validate comprueba que la regla esté dentro del subconjunto.
func (r Rule) Validate() error {
	if r.Freq == 0 {
		return errors.New("falta FREQ")
	}
	if r.Interval < 1 || r.Interval > 99 {
		return errors.New("INTERVAL debe estar entre 1 y 99")
	}
	if r.Count < 0 || r.Count > MaxCount {
		return fmt.Errorf("COUNT debe estar entre 1 y %d", MaxCount)
	}
	if r.Count > 0 && !r.Until.IsZero() {
		return errors.New("COUNT y UNTIL no pueden ir juntos")
	}
	for _, d := range r.ByDay {
		if d.N != 0 {
			if r.Freq != Monthly && r.Freq != Yearly {
				return fmt.Errorf("%w: ordinal en BYDAY solo con MONTHLY o YEARLY", ErrUnsupported)
			}
			if d.N < -5 || d.N > 5 {
				return errors.New("el ordinal de BYDAY va de -5 a 5")
			}
			if r.Freq == Yearly && len(r.ByMonth) == 0 {
				return fmt.Errorf("%w: BYDAY con ordinal en YEARLY exige BYMONTH", ErrUnsupported)
			}
		}
	}
	for _, md := range r.ByMonthDay {
		if md != -1 && (md < 1 || md > 31) {
			return errors.New("BYMONTHDAY va de 1 a 31 o -1")
		}
	}
	return nil
}

// String devuelve la forma canónica.
func (r Rule) String() string {
	parts := []string{"FREQ=" + freqNames[r.Freq]}
	if r.Interval > 1 {
		parts = append(parts, fmt.Sprintf("INTERVAL=%d", r.Interval))
	}
	if len(r.ByMonth) > 0 {
		var ms []string
		for _, m := range r.ByMonth {
			ms = append(ms, strconv.Itoa(int(m)))
		}
		parts = append(parts, "BYMONTH="+strings.Join(ms, ","))
	}
	if len(r.ByMonthDay) > 0 {
		var ds []string
		for _, d := range r.ByMonthDay {
			ds = append(ds, strconv.Itoa(d))
		}
		parts = append(parts, "BYMONTHDAY="+strings.Join(ds, ","))
	}
	if len(r.ByDay) > 0 {
		var ds []string
		for _, d := range r.ByDay {
			if d.N != 0 {
				ds = append(ds, strconv.Itoa(d.N)+dayCode(d.Day))
			} else {
				ds = append(ds, dayCode(d.Day))
			}
		}
		parts = append(parts, "BYDAY="+strings.Join(ds, ","))
	}
	if r.Count > 0 {
		parts = append(parts, fmt.Sprintf("COUNT=%d", r.Count))
	}
	if !r.Until.IsZero() {
		parts = append(parts, "UNTIL="+r.Until.UTC().Format("20060102T150405Z"))
	}
	return strings.Join(parts, ";")
}

func daysIn(y int, m time.Month) int { return time.Date(y, m+1, 0, 12, 0, 0, 0, time.UTC).Day() }

func isoWeekday(wd time.Weekday) int {
	if wd == time.Sunday {
		return 7
	}
	return int(wd)
}

// monthDates devuelve las fechas de un mes que cumplen BYDAY/BYMONTHDAY (o el día de inicio por defecto).
func (r Rule) monthDates(y int, m time.Month, startDay int) []domain.Date {
	n := daysIn(y, m)
	var byMD []int
	for _, md := range r.ByMonthDay {
		if md == -1 {
			md = n
		}
		if md <= n {
			byMD = append(byMD, md)
		}
	}
	var byDay []int
	for _, wd := range r.ByDay {
		var matches []int
		for d := 1; d <= n; d++ {
			if time.Date(y, m, d, 12, 0, 0, 0, time.UTC).Weekday() == wd.Day {
				matches = append(matches, d)
			}
		}
		switch {
		case wd.N > 0 && wd.N <= len(matches):
			byDay = append(byDay, matches[wd.N-1])
		case wd.N < 0 && -wd.N <= len(matches):
			byDay = append(byDay, matches[len(matches)+wd.N])
		case wd.N == 0:
			byDay = append(byDay, matches...)
		}
	}
	var days []int
	switch {
	case len(r.ByDay) > 0 && len(r.ByMonthDay) > 0:
		for _, d := range byDay {
			if slices.Contains(byMD, d) {
				days = append(days, d)
			}
		}
	case len(r.ByDay) > 0:
		days = byDay
	case len(r.ByMonthDay) > 0:
		days = byMD
	default:
		if startDay <= n {
			days = []int{startDay}
		}
	}
	slices.Sort(days)
	days = slices.Compact(days)
	out := make([]domain.Date, 0, len(days))
	for _, d := range days {
		out = append(out, domain.Date{Year: y, Month: m, Day: d})
	}
	return out
}

func (r Rule) monthAllowed(m time.Month) bool {
	return len(r.ByMonth) == 0 || slices.Contains(r.ByMonth, m)
}

// Dates genera las fechas de la regla desde start (inclusive) hasta last (inclusive), como mucho max.
func (r Rule) Dates(start, last domain.Date, maxN int) []domain.Date {
	var out []domain.Date
	push := func(d domain.Date) bool {
		if d.Before(start) {
			return true
		}
		if d.After(last) || len(out) >= maxN {
			return false
		}
		out = append(out, d)
		return true
	}
	switch r.Freq {
	case Daily:
		for i, d := 0, start; !d.After(last) && i < 40000 && len(out) < maxN; i, d = i+1, d.AddDays(r.Interval) {
			if !r.monthAllowed(d.Month) {
				continue
			}
			if len(r.ByDay) > 0 && !slices.ContainsFunc(r.ByDay, func(w WeekdayNum) bool { return w.Day == d.Weekday() }) {
				continue
			}
			if len(r.ByMonthDay) > 0 && !slices.ContainsFunc(r.ByMonthDay, func(md int) bool {
				return md == d.Day || (md == -1 && d.Day == daysIn(d.Year, d.Month))
			}) {
				continue
			}
			push(d)
		}
	case Weekly:
		days := r.ByDay
		if len(days) == 0 {
			days = []WeekdayNum{{Day: start.Weekday()}}
		}
		isos := make([]int, 0, len(days))
		for _, d := range days {
			isos = append(isos, isoWeekday(d.Day))
		}
		slices.Sort(isos)
		isos = slices.Compact(isos)
		weekStart := start.AddDays(1 - start.ISOWeekday())
		for w := 0; w < 6000; w += r.Interval {
			base := weekStart.AddDays(7 * w)
			if base.After(last) {
				break
			}
			for _, iso := range isos {
				d := base.AddDays(iso - 1)
				if !r.monthAllowed(d.Month) {
					continue
				}
				if !push(d) {
					return out
				}
			}
		}
	case Monthly:
		for k := 0; k < 2400; k += r.Interval {
			t := time.Date(start.Year, start.Month+time.Month(k), 1, 12, 0, 0, 0, time.UTC)
			if (domain.Date{Year: t.Year(), Month: t.Month(), Day: 1}).After(last) {
				break
			}
			if !r.monthAllowed(t.Month()) {
				continue
			}
			for _, d := range r.monthDates(t.Year(), t.Month(), start.Day) {
				if !push(d) {
					return out
				}
			}
		}
	case Yearly:
		months := r.ByMonth
		if len(months) == 0 {
			months = []time.Month{start.Month}
		}
		months = slices.Clone(months)
		slices.Sort(months)
		for k := 0; k < 200; k += r.Interval {
			y := start.Year + k
			if (domain.Date{Year: y, Month: time.January, Day: 1}).After(last) {
				break
			}
			for _, m := range months {
				for _, d := range r.monthDates(y, m, start.Day) {
					if !push(d) {
						return out
					}
				}
			}
		}
	}
	return out
}

// Start es el inicio de la serie en hora de pared.
type Start struct {
	Date  domain.Date
	Clock domain.Clock
}

// Occurrence es una instancia de la serie.
type Occurrence struct {
	Start time.Time
	End   time.Time
	// Local es la fecha y hora de pared original (clave de EXDATE y RECURRENCE-ID).
	Local Start
}

// LocalKey identifica una instancia por su hora de pared ("AAAA-MM-DDTHH:MM").
func LocalKey(s Start) string { return s.Date.String() + "T" + s.Clock.String() }

// Expand devuelve las instancias hasta horizon (o UNTIL/COUNT), saltando las de exdates.
// COUNT se cuenta antes de quitar EXDATE (RFC 5545 §3.8.5.1).
func Expand(r Rule, start Start, loc *time.Location, dur time.Duration, horizon time.Time, exdates map[string]bool) []Occurrence {
	last := domain.DateOf(horizon.In(loc)).AddDays(1)
	if !r.Until.IsZero() {
		if u := domain.DateOf(r.Until.In(loc)).AddDays(1); u.Before(last) {
			last = u
		}
	}
	maxN := MaxCount
	if r.Count > 0 {
		maxN = r.Count
	}
	var out []Occurrence
	for _, d := range r.Dates(start.Date, last, maxN) {
		s, _ := domain.Resolve(d, start.Clock, loc)
		if !r.Until.IsZero() && s.After(r.Until) {
			break
		}
		if s.After(horizon) {
			break
		}
		local := Start{Date: d, Clock: start.Clock}
		if exdates[LocalKey(local)] {
			continue
		}
		out = append(out, Occurrence{Start: s, End: s.Add(dur), Local: local})
	}
	return out
}
