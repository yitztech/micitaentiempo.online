package recurrence

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/teambition/rrule-go"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
	"pgregory.net/rapid"
)

func dates(t *testing.T, rule string, start string, last string) []string {
	t.Helper()
	r, err := Parse(rule)
	if err != nil {
		t.Fatalf("%s: %v", rule, err)
	}
	s, _ := domain.ParseDate(start)
	l, _ := domain.ParseDate(last)
	horizon, _ := domain.Resolve(l, 23*60, time.UTC)
	var out []string
	// Inicio a las 09:00 UTC, como en los ejemplos del RFC: UNTIL se compara con el instante.
	for _, o := range Expand(r, Start{Date: s, Clock: 9 * 60}, time.UTC, time.Hour, horizon, nil) {
		out = append(out, o.Local.Date.String())
	}
	return out
}

// Ejemplos del RFC 5545 §3.8.5.3 dentro del subconjunto.
func TestEjemplosRFC5545(t *testing.T) {
	cases := []struct {
		name, rule, start, last, want string
	}{
		{"diaria 10 veces", "FREQ=DAILY;COUNT=10", "1997-09-02", "1998-12-31",
			"1997-09-02 1997-09-03 1997-09-04 1997-09-05 1997-09-06 1997-09-07 1997-09-08 1997-09-09 1997-09-10 1997-09-11"},
		{"martes y jueves cinco semanas", "FREQ=WEEKLY;UNTIL=19971007T000000Z;BYDAY=TU,TH", "1997-09-02", "1997-10-07",
			"1997-09-02 1997-09-04 1997-09-09 1997-09-11 1997-09-16 1997-09-18 1997-09-23 1997-09-25 1997-09-30 1997-10-02"},
		{"lunes miércoles viernes cada dos semanas", "FREQ=WEEKLY;INTERVAL=2;UNTIL=19971224T000000Z;BYDAY=MO,WE,FR", "1997-09-01", "1997-12-31",
			"1997-09-01 1997-09-03 1997-09-05 1997-09-15 1997-09-17 1997-09-19 1997-09-29 1997-10-01 1997-10-03 1997-10-13 1997-10-15 1997-10-17 1997-10-27 1997-10-29 1997-10-31 1997-11-10 1997-11-12 1997-11-14 1997-11-24 1997-11-26 1997-11-28 1997-12-08 1997-12-10 1997-12-12 1997-12-22"},
		{"primer viernes de cada mes", "FREQ=MONTHLY;COUNT=10;BYDAY=1FR", "1997-09-05", "1999-01-01",
			"1997-09-05 1997-10-03 1997-11-07 1997-12-05 1998-01-02 1998-02-06 1998-03-06 1998-04-03 1998-05-01 1998-06-05"},
		{"penúltimo lunes", "FREQ=MONTHLY;COUNT=6;BYDAY=-2MO", "1997-09-22", "1999-01-01",
			"1997-09-22 1997-10-20 1997-11-17 1997-12-22 1998-01-19 1998-02-16"},
		{"junio y julio cada año", "FREQ=YEARLY;COUNT=10;BYMONTH=6,7", "1997-06-10", "2003-01-01",
			"1997-06-10 1997-07-10 1998-06-10 1998-07-10 1999-06-10 1999-07-10 2000-06-10 2000-07-10 2001-06-10 2001-07-10"},
		{"día 31 salta meses cortos", "FREQ=MONTHLY;COUNT=4", "2026-01-31", "2027-12-31",
			"2026-01-31 2026-03-31 2026-05-31 2026-07-31"},
		{"último día del mes", "FREQ=MONTHLY;COUNT=3;BYMONTHDAY=-1", "2026-01-15", "2027-12-31",
			"2026-01-31 2026-02-28 2026-03-31"},
		{"Acción de Gracias de EE. UU.", "FREQ=YEARLY;COUNT=3;BYMONTH=11;BYDAY=4TH", "2026-01-01", "2030-12-31",
			"2026-11-26 2027-11-25 2028-11-23"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := dates(t, c.rule, c.start, c.last)
			r, _ := Parse(c.rule)
			if r.Count > 0 && len(got) > r.Count {
				got = got[:r.Count]
			}
			if strings.Join(got, " ") != c.want {
				t.Fatalf("\n got: %s\nwant: %s", strings.Join(got, " "), c.want)
			}
		})
	}
}

func TestRechazos(t *testing.T) {
	for _, bad := range []string{"", "FREQ=HOURLY", "FREQ=WEEKLY;BYSETPOS=1", "FREQ=WEEKLY;BYDAY=2TU", "FREQ=DAILY;COUNT=5;UNTIL=20270101T000000Z",
		"FREQ=DAILY;INTERVAL=0", "FREQ=MONTHLY;BYMONTHDAY=-3", "FREQ=WEEKLY;WKST=SU", "FREQ=YEARLY;BYDAY=1MO", "FREQ=DAILY;COUNT=731"} {
		if _, err := Parse(bad); err == nil {
			t.Errorf("se aceptó %q", bad)
		}
	}
	r, _ := Parse("RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=5")
	if r.String() != "FREQ=WEEKLY;BYDAY=TU,TH;COUNT=5" {
		t.Fatalf("canónica: %s", r)
	}
}

func TestExpandHoraDeParedYExdate(t *testing.T) {
	ny, _ := time.LoadLocation("America/New_York")
	r, _ := Parse("FREQ=WEEKLY;BYDAY=SU;COUNT=4")
	start := Start{Date: domain.Date{Year: 2026, Month: time.March, Day: 1}, Clock: 10 * 60}
	occ := Expand(r, start, ny, time.Hour, time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC),
		map[string]bool{"2026-03-15T10:00": true})
	if len(occ) != 3 { // COUNT=4 cuenta la excluida
		t.Fatalf("instancias: %d", len(occ))
	}
	for _, o := range occ {
		if h := o.Start.In(ny).Hour(); h != 10 {
			t.Fatalf("%v no es a las 10:00 de Nueva York", o.Start.In(ny))
		}
	}
	// El 8 de marzo cambia el horario: 10:00 EST (15:00 UTC) frente a 10:00 EDT (14:00 UTC).
	if occ[0].Start.UTC().Hour() != 15 || occ[1].Start.UTC().Hour() != 14 {
		t.Fatalf("UTC: %v %v", occ[0].Start.UTC(), occ[1].Start.UTC())
	}
}

// Diferencial con rrule-go (UTC, sin ambigüedades de horario de verano).
func TestDiferencialConRruleGo(t *testing.T) {
	codes := []string{"MO", "TU", "WE", "TH", "FR", "SA", "SU"}
	rapid.Check(t, func(rt *rapid.T) {
		freq := rapid.SampledFrom([]string{"DAILY", "WEEKLY", "MONTHLY", "YEARLY"}).Draw(rt, "freq")
		parts := []string{"FREQ=" + freq, fmt.Sprintf("INTERVAL=%d", rapid.IntRange(1, 3).Draw(rt, "interval"))}
		switch freq {
		case "WEEKLY", "DAILY":
			if rapid.Bool().Draw(rt, "byday") {
				n := rapid.IntRange(1, 3).Draw(rt, "ndays")
				var ds []string
				for i := 0; i < n; i++ {
					ds = append(ds, rapid.SampledFrom(codes).Draw(rt, "day"))
				}
				parts = append(parts, "BYDAY="+strings.Join(uniq(ds), ","))
			}
		case "MONTHLY":
			switch rapid.IntRange(0, 2).Draw(rt, "modo") {
			case 1:
				parts = append(parts, fmt.Sprintf("BYDAY=%d%s", rapid.SampledFrom([]int{1, 2, 3, 4, -1}).Draw(rt, "ord"), rapid.SampledFrom(codes).Draw(rt, "d")))
			case 2:
				parts = append(parts, fmt.Sprintf("BYMONTHDAY=%d", rapid.SampledFrom([]int{1, 5, 15, 28, 30, 31, -1}).Draw(rt, "md")))
			}
		case "YEARLY":
			if rapid.Bool().Draw(rt, "bymonth") {
				parts = append(parts, fmt.Sprintf("BYMONTH=%d", rapid.IntRange(1, 12).Draw(rt, "m")))
			}
		}
		count := rapid.IntRange(1, 25).Draw(rt, "count")
		parts = append(parts, fmt.Sprintf("COUNT=%d", count))
		rule := strings.Join(parts, ";")
		dt := time.Date(2026, time.Month(rapid.IntRange(1, 12).Draw(rt, "mes")), rapid.IntRange(1, 28).Draw(rt, "dia"), 10, 0, 0, 0, time.UTC)

		ref, err := rrule.StrToRRule(rule)
		if err != nil {
			rt.Fatalf("rrule-go no entiende %s: %v", rule, err)
		}
		ref.DTStart(dt)
		var want []string
		for _, x := range ref.All() {
			want = append(want, x.Format(time.DateOnly))
		}
		r, err := Parse(rule)
		if err != nil {
			rt.Fatalf("%s: %v", rule, err)
		}
		var got []string
		for _, o := range Expand(r, Start{Date: domain.DateOf(dt), Clock: 600}, time.UTC, time.Hour, dt.AddDate(150, 0, 0), nil) {
			got = append(got, o.Start.Format(time.DateOnly))
		}
		if strings.Join(got, " ") != strings.Join(want, " ") {
			rt.Fatalf("%s desde %s\n got: %v\nwant: %v", rule, dt.Format(time.DateOnly), got, want)
		}
	})
}

func uniq(xs []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, x := range xs {
		if !seen[x] {
			seen[x] = true
			out = append(out, x)
		}
	}
	return out
}
