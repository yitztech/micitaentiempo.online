package domain

import (
	"slices"
	"time"
)

// Interval es un intervalo semiabierto [Start, End) en UTC.
type Interval struct {
	Start time.Time
	End   time.Time
}

// Empty indica si el intervalo no contiene ningún instante.
func (i Interval) Empty() bool { return !i.End.After(i.Start) }

// Overlaps indica si dos intervalos semiabiertos se solapan.
func (i Interval) Overlaps(o Interval) bool { return i.Start.Before(o.End) && o.Start.Before(i.End) }

// Contains indica si o cabe entero dentro de i.
func (i Interval) Contains(o Interval) bool { return !o.Start.Before(i.Start) && !o.End.After(i.End) }

// Subtract quita de cada intervalo de set los intervalos de cut.
func Subtract(set, cut []Interval) []Interval {
	out := slices.Clone(set)
	for _, c := range cut {
		var next []Interval
		for _, s := range out {
			if !s.Overlaps(c) {
				next = append(next, s)
				continue
			}
			if s.Start.Before(c.Start) {
				next = append(next, Interval{s.Start, c.Start})
			}
			if c.End.Before(s.End) {
				next = append(next, Interval{c.End, s.End})
			}
		}
		out = next
	}
	return out
}

// Normalize ordena y fusiona intervalos solapados o contiguos.
func Normalize(in []Interval) []Interval {
	var xs []Interval
	for _, i := range in {
		if !i.Empty() {
			xs = append(xs, i)
		}
	}
	slices.SortFunc(xs, func(a, b Interval) int { return a.Start.Compare(b.Start) })
	var out []Interval
	for _, x := range xs {
		if n := len(out); n > 0 && !x.Start.After(out[n-1].End) {
			if x.End.After(out[n-1].End) {
				out[n-1].End = x.End
			}
			continue
		}
		out = append(out, x)
	}
	return out
}
