package availability

import (
	"testing"
	"time"

	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
	"pgregory.net/rapid"
)

func loc(t testing.TB, name string) *time.Location {
	t.Helper()
	l, err := time.LoadLocation(name)
	if err != nil {
		t.Fatal(err)
	}
	return l
}

func weekdays(open ...ClockRange) map[int][]Shift {
	m := map[int][]Shift{}
	for wd := 1; wd <= 7; wd++ {
		for _, r := range open {
			m[wd] = append(m[wd], Shift{Kind: Open, Range: r})
		}
	}
	return m
}

func base(l *time.Location, now time.Time) Input {
	return Input{
		Location: l,
		Capacity: 1,
		Weekly:   weekdays(ClockRange{9 * 60, 18 * 60}),
		Service:  Service{ID: "s", Duration: 30 * time.Minute, Step: 30 * time.Minute, MaxAdvanceDays: 60},
		Now:      now,
		From:     now,
		To:       now.Add(24 * time.Hour),
	}
}

func TestDiaNormalConComida(t *testing.T) {
	mx := loc(t, "America/Mexico_City")
	now := time.Date(2026, 9, 15, 6, 0, 0, 0, mx) // martes 06:00
	in := base(mx, now)
	in.Weekly[2] = append(in.Weekly[2], Shift{Kind: Break, Range: ClockRange{14 * 60, 15 * 60}, Label: "Comida"})
	slots := Compute(in)
	if len(slots) != 16 { // 09:00–14:00 (10) + 15:00–18:00 (6)
		t.Fatalf("se esperaban 16 huecos, hay %d", len(slots))
	}
	for _, s := range slots {
		h := s.Start.In(mx).Hour()
		if h == 14 {
			t.Fatalf("hueco en la comida: %v", s.Start.In(mx))
		}
	}
}

func TestCambioDeHorarioNuevaYork(t *testing.T) {
	ny := loc(t, "America/New_York")
	for _, tc := range []struct {
		day  domain.Date
		want int
	}{
		{domain.Date{Year: 2026, Month: time.March, Day: 8}, 23},    // 02:00 no existe
		{domain.Date{Year: 2026, Month: time.November, Day: 1}, 24}, // 01:00 se repite: solo la primera
		{domain.Date{Year: 2026, Month: time.November, Day: 2}, 24}, // día normal
	} {
		dayStart, _ := domain.Resolve(tc.day, 0, ny)
		dayEnd, _ := domain.Resolve(tc.day.AddDays(1), 0, ny)
		in := base(ny, dayStart.Add(-48*time.Hour))
		in.Weekly = weekdays(ClockRange{0, 24 * 60})
		in.Service = Service{ID: "s", Duration: 60 * time.Minute, Step: 60 * time.Minute, MaxAdvanceDays: 30}
		in.From, in.To = dayStart, dayEnd
		if got := len(Compute(in)); got != tc.want {
			t.Errorf("%s: %d huecos, se esperaban %d", tc.day, got, tc.want)
		}
	}
}

func TestMargenesYCapacidad(t *testing.T) {
	utc := time.UTC
	now := time.Date(2026, 1, 5, 7, 0, 0, 0, utc)
	in := base(utc, now)
	in.Service.BufferAfter = 10 * time.Minute
	appt := Appointment{
		Interval:    domain.Interval{Start: time.Date(2026, 1, 5, 10, 0, 0, 0, utc), End: time.Date(2026, 1, 5, 10, 30, 0, 0, utc)},
		Seat:        1,
		ServiceID:   "s",
		BufferAfter: 10 * time.Minute,
	}
	in.Appointments = []Appointment{appt}
	has := func(slots []Slot, h, m int) bool {
		for _, s := range slots {
			if s.Start.Equal(time.Date(2026, 1, 5, h, m, 0, 0, utc)) {
				return true
			}
		}
		return false
	}
	slots := Compute(in)
	if has(slots, 10, 0) || has(slots, 10, 30) || has(slots, 9, 30) {
		t.Fatal("los márgenes deben excluir 09:30, 10:00 y 10:30")
	}
	if !has(slots, 11, 0) || !has(slots, 9, 0) {
		t.Fatal("09:00 y 11:00 deben estar libres")
	}
	in.Capacity = 2
	slots = Compute(in)
	if !has(slots, 10, 0) {
		t.Fatal("con capacidad 2, 10:00 tiene un asiento libre")
	}
}

func TestBloqueosFeriadosYExcepciones(t *testing.T) {
	utc := time.UTC
	now := time.Date(2026, 1, 5, 0, 0, 0, 0, utc)
	in := base(utc, now)
	in.To = now.Add(72 * time.Hour)
	in.Holidays = map[domain.Date]bool{{Year: 2026, Month: 1, Day: 6}: true, {Year: 2026, Month: 1, Day: 7}: true}
	in.Overrides = map[domain.Date]Override{
		{Year: 2026, Month: 1, Day: 7}: {Kind: OpenOnHoliday},
		{Year: 2026, Month: 1, Day: 5}: {Kind: Custom, Intervals: []ClockRange{{10 * 60, 11 * 60}}},
	}
	in.Blocks = []domain.Interval{{Start: time.Date(2026, 1, 7, 9, 0, 0, 0, utc), End: time.Date(2026, 1, 7, 17, 0, 0, 0, utc)}}
	count := map[int]int{}
	for _, s := range Compute(in) {
		count[s.Start.Day()]++
	}
	if count[5] != 2 || count[6] != 0 || count[7] != 2 {
		t.Fatalf("huecos por día: %v (esperado 5→2, 6→0, 7→2)", count)
	}
}

func TestAntelacionYLimiteDiario(t *testing.T) {
	utc := time.UTC
	now := time.Date(2026, 1, 5, 9, 10, 0, 0, utc)
	in := base(utc, now)
	in.Service.MinNotice = 60 * time.Minute
	slots := Compute(in)
	if !slots[0].Start.Equal(time.Date(2026, 1, 5, 10, 30, 0, 0, utc)) {
		t.Fatalf("primer hueco %v, se esperaba 10:30 (antelación de 1 h)", slots[0].Start)
	}
	in.Service.DailyLimit = 1
	in.Appointments = []Appointment{{Interval: domain.Interval{Start: time.Date(2026, 1, 5, 17, 0, 0, 0, utc), End: time.Date(2026, 1, 5, 17, 30, 0, 0, utc)}, Seat: 1, ServiceID: "s"}}
	for _, s := range Compute(in) {
		if s.Start.Day() == 5 {
			t.Fatal("con el límite diario cubierto no debe haber huecos ese día")
		}
	}
}

// Propiedades: ningún hueco cae fuera de horario, en un bloqueo, sin asiento, desalineado o fuera de ventana.
func TestPropiedades(t *testing.T) {
	zones := []string{"UTC", "America/Mexico_City", "America/New_York", "America/St_Johns", "Asia/Kolkata", "Australia/Lord_Howe", "Europe/Madrid"}
	rapid.Check(t, func(r *rapid.T) {
		l := loc(t, rapid.SampledFrom(zones).Draw(r, "zona"))
		now := time.Date(2026, time.Month(rapid.IntRange(1, 12).Draw(r, "mes")), rapid.IntRange(1, 28).Draw(r, "dia"),
			rapid.IntRange(0, 23).Draw(r, "hora"), 0, 0, 0, time.UTC)
		openStart := rapid.IntRange(0, 20).Draw(r, "abre") * 60
		openEnd := rapid.IntRange(openStart/60+1, 24).Draw(r, "cierra") * 60
		step := rapid.SampledFrom([]int{15, 30, 60}).Draw(r, "paso")
		in := Input{
			Location: l,
			Capacity: rapid.IntRange(1, 3).Draw(r, "capacidad"),
			Weekly:   weekdays(ClockRange{domain.Clock(openStart), domain.Clock(openEnd)}),
			Service: Service{
				ID: "s", Duration: time.Duration(rapid.SampledFrom([]int{15, 30, 45, 60}).Draw(r, "duracion")) * time.Minute,
				Step: time.Duration(step) * time.Minute, MinNotice: time.Duration(rapid.IntRange(0, 180).Draw(r, "antelacion")) * time.Minute,
				BufferAfter: time.Duration(rapid.IntRange(0, 30).Draw(r, "margen")) * time.Minute, MaxAdvanceDays: 10,
			},
			Now: now, From: now, To: now.Add(5 * 24 * time.Hour),
		}
		blockStart := now.Add(time.Duration(rapid.IntRange(0, 96).Draw(r, "bloqueo")) * time.Hour)
		in.Blocks = []domain.Interval{{Start: blockStart, End: blockStart.Add(3 * time.Hour)}}
		slots := Compute(in)
		for i, s := range slots {
			if i > 0 && !slots[i-1].Start.Before(s.Start) {
				r.Fatalf("no ordenados o repetidos")
			}
			if s.Start.Before(now.Add(in.Service.MinNotice)) || !s.Start.Before(in.To) {
				r.Fatalf("fuera de ventana: %v", s.Start)
			}
			if s.SeatsFree < 1 {
				r.Fatalf("sin asientos")
			}
			lw := s.Start.In(l)
			min := lw.Hour()*60 + lw.Minute()
			if min%step != 0 || min < openStart {
				r.Fatalf("desalineado o antes de abrir: %v", lw)
			}
			endLocal := s.End.In(l)
			if domain.DateOf(endLocal) == domain.DateOf(lw) && endLocal.Hour()*60+endLocal.Minute() > openEnd {
				r.Fatalf("termina después de cerrar: %v", endLocal)
			}
			want := domain.Interval{Start: s.Start, End: s.End.Add(in.Service.BufferAfter)}
			if want.Overlaps(in.Blocks[0]) {
				r.Fatalf("solapa un bloqueo: %v", s.Start)
			}
		}
	})
}
