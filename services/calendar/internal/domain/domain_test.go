package domain

import (
	"testing"
	"time"
)

func mustLoad(t *testing.T, name string) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation(name)
	if err != nil {
		t.Fatal(err)
	}
	return loc
}

func TestResolveSaltoDePrimavera(t *testing.T) {
	ny := mustLoad(t, "America/New_York")
	// 2026-03-08: a las 02:00 se pasa a las 03:00.
	got, ok := Resolve(Date{2026, time.March, 8}, 150, ny) // 02:30 no existe
	if ok {
		t.Fatal("02:30 no debería existir")
	}
	if want := time.Date(2026, 3, 8, 7, 0, 0, 0, time.UTC); !got.Equal(want) { // 03:00 EDT
		t.Fatalf("primer instante válido = %v, se esperaba %v", got, want)
	}
}

func TestResolveHoraAmbigua(t *testing.T) {
	ny := mustLoad(t, "America/New_York")
	// 2026-11-01: 01:30 ocurre dos veces; se toma la primera (EDT, UTC-4).
	got, ok := Resolve(Date{2026, time.November, 1}, 90, ny)
	if !ok {
		t.Fatal("01:30 existe")
	}
	if want := time.Date(2026, 11, 1, 5, 30, 0, 0, time.UTC); !got.Equal(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestResolveLordHoweMediaHora(t *testing.T) {
	lh := mustLoad(t, "Australia/Lord_Howe")
	// 2026-10-04: a las 02:00 se adelanta 30 minutos.
	if _, ok := Resolve(Date{2026, time.October, 4}, 135, lh); ok {
		t.Fatal("02:15 no debería existir en Lord Howe")
	}
	if _, ok := Resolve(Date{2026, time.October, 4}, 150, lh); !ok {
		t.Fatal("02:30 sí existe")
	}
}

func TestSubtractYNormalize(t *testing.T) {
	at := func(h int) time.Time { return time.Date(2026, 1, 1, h, 0, 0, 0, time.UTC) }
	got := Subtract([]Interval{{at(9), at(18)}}, []Interval{{at(14), at(15)}, {at(8), at(10)}})
	if len(got) != 2 || !got[0].Start.Equal(at(10)) || !got[1].Start.Equal(at(15)) {
		t.Fatalf("resta: %v", got)
	}
	n := Normalize([]Interval{{at(10), at(12)}, {at(9), at(10)}, {at(13), at(14)}})
	if len(n) != 2 || !n[0].Start.Equal(at(9)) || !n[0].End.Equal(at(12)) {
		t.Fatalf("normalize: %v", n)
	}
}

func TestDateAddDaysCruzaMeses(t *testing.T) {
	if got := (Date{2026, time.February, 28}).AddDays(1); got != (Date{2026, time.March, 1}) {
		t.Fatal(got)
	}
	if (Date{2026, time.October, 5}).ISOWeekday() != 1 {
		t.Fatal("2026-10-05 es lunes")
	}
}
