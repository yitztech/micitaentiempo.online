// Package domain contiene los tipos puros del motor: fechas civiles, horas de pared e intervalos.
package domain

import (
	"fmt"
	"time"
)

// Date es una fecha civil (sin hora ni zona).
type Date struct {
	Year  int
	Month time.Month
	Day   int
}

// ParseDate lee "AAAA-MM-DD".
func ParseDate(s string) (Date, error) {
	t, err := time.Parse(time.DateOnly, s)
	if err != nil {
		return Date{}, fmt.Errorf("fecha no válida %q: %w", s, err)
	}
	return DateOf(t), nil
}

// DateOf devuelve la fecha civil de un instante en su propia zona.
func DateOf(t time.Time) Date {
	y, m, d := t.Date()
	return Date{y, m, d}
}

// String devuelve "AAAA-MM-DD".
func (d Date) String() string { return fmt.Sprintf("%04d-%02d-%02d", d.Year, d.Month, d.Day) }

// AddDays avanza (o retrocede) días civiles, sin pasar por instantes.
func (d Date) AddDays(n int) Date {
	return DateOf(time.Date(d.Year, d.Month, d.Day+n, 12, 0, 0, 0, time.UTC))
}

// Weekday devuelve el día de la semana.
func (d Date) Weekday() time.Weekday {
	return time.Date(d.Year, d.Month, d.Day, 12, 0, 0, 0, time.UTC).Weekday()
}

// ISOWeekday: 1 = lunes … 7 = domingo (ISO 8601).
func (d Date) ISOWeekday() int {
	wd := int(d.Weekday())
	if wd == 0 {
		return 7
	}
	return wd
}

// Before indica si d es anterior a o.
func (d Date) Before(o Date) bool { return d.String() < o.String() }

// After indica si d es posterior a o.
func (d Date) After(o Date) bool { return d.String() > o.String() }

// MonthDay devuelve "MM-DD" (feriados que se repiten cada año).
func (d Date) MonthDay() string { return fmt.Sprintf("%02d-%02d", d.Month, d.Day) }

// Clock es una hora de pared en minutos desde la medianoche (0…1440).
type Clock int

// ParseClock lee "HH:MM" (acepta "24:00" como fin de día).
func ParseClock(s string) (Clock, error) {
	var h, m int
	if _, err := fmt.Sscanf(s, "%d:%d", &h, &m); err != nil || h < 0 || h > 24 || m < 0 || m > 59 || (h == 24 && m != 0) {
		return 0, fmt.Errorf("hora no válida %q", s)
	}
	return Clock(h*60 + m), nil
}

// String devuelve "HH:MM".
func (c Clock) String() string { return fmt.Sprintf("%02d:%02d", int(c)/60, int(c)%60) }

// Resolve convierte una hora de pared de una fecha en un instante de la zona dada.
//   - Hora inexistente (salto de primavera): exists = false y el instante devuelto es el primer
//     instante válido posterior (RFC 5545 §3.3.5).
//   - Hora ambigua (otoño): se toma la primera aparición (el instante más temprano).
//
// El resultado no depende de la elección no especificada de time.Date en esos casos.
func Resolve(d Date, c Clock, loc *time.Location) (instant time.Time, exists bool) {
	if t, ok := exact(d, c, loc); ok {
		return t, true
	}
	// Hueco: avanzar minuto a minuto hasta la primera hora que exista (los saltos reales
	// son de 30 a 120 minutos).
	for i := 1; i <= 24*60; i++ {
		next, nd := Clock(int(c)+i), d
		if next >= 24*60 {
			nd, next = d.AddDays(1), next-24*60
		}
		if t, ok := exact(nd, next, loc); ok {
			return t, false
		}
	}
	h, m := int(c)/60, int(c)%60
	return time.Date(d.Year, d.Month, d.Day, h, m, 0, 0, loc).UTC(), false
}

// exact devuelve el instante más temprano cuya hora de pared en loc es exactamente d c.
func exact(d Date, c Clock, loc *time.Location) (time.Time, bool) {
	h, m := int(c)/60, int(c)%60
	wall := time.Date(d.Year, d.Month, d.Day, h, m, 0, 0, time.UTC)
	var best time.Time
	for _, off := range offsetsAround(d, loc) {
		cand := wall.Add(-time.Duration(off) * time.Second)
		lw := cand.In(loc)
		if lw.Year() == wall.Year() && lw.Month() == wall.Month() && lw.Day() == wall.Day() &&
			lw.Hour() == wall.Hour() && lw.Minute() == wall.Minute() {
			if best.IsZero() || cand.Before(best) {
				best = cand
			}
		}
	}
	if best.IsZero() {
		return time.Time{}, false
	}
	return best.UTC(), true
}

// offsetsAround devuelve los desfases UTC distintos de la zona en torno a una fecha.
func offsetsAround(d Date, loc *time.Location) []int {
	seen := map[int]bool{}
	var out []int
	for _, delta := range []int{-1, 0, 1} {
		dd := d.AddDays(delta)
		for _, hour := range []int{0, 12} {
			_, off := time.Date(dd.Year, dd.Month, dd.Day, hour, 0, 0, 0, loc).Zone()
			if !seen[off] {
				seen[off] = true
				out = append(out, off)
			}
		}
	}
	return out
}
