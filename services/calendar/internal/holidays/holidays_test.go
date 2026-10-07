package holidays

import (
	"testing"
	"time"

	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
)

func catalog(t *testing.T) *Catalog {
	t.Helper()
	c, err := NewCatalog()
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestMexicoIndependencia(t *testing.T) {
	c := catalog(t)
	ms, err := c.Resolve([]Policy{{Country: "MX", Types: []string{"public"}, Substitutes: true}}, nil,
		domain.Date{Year: 2026, Month: time.September, Day: 1}, domain.Date{Year: 2026, Month: time.September, Day: 30})
	if err != nil {
		t.Fatal(err)
	}
	if len(ms) != 1 || ms[0].Date != (domain.Date{Year: 2026, Month: time.September, Day: 16}) || ms[0].Names["es"] != "Día de la Independencia" {
		t.Fatalf("feriados de septiembre en MX: %+v", ms)
	}
}

func TestRegionYSustitutos(t *testing.T) {
	c := catalog(t)
	jul := func(d int) domain.Date { return domain.Date{Year: 2026, Month: time.July, Day: d} }
	con, _ := c.Resolve([]Policy{{Country: "US", Types: []string{"public"}, Substitutes: true}}, nil, jul(1), jul(10))
	sin, _ := c.Resolve([]Policy{{Country: "US", Types: []string{"public"}, Substitutes: false}}, nil, jul(1), jul(10))
	if !Dates(con)[jul(3)] || Dates(sin)[jul(3)] {
		t.Fatalf("el 3 de julio (sustituto) debe depender de la política: con=%v sin=%v", con, sin)
	}
	// Quebec tiene la Fiesta Nacional (24 de junio); Ontario no.
	jun24 := domain.Date{Year: 2026, Month: time.June, Day: 24}
	qc, _ := c.Resolve([]Policy{{Country: "CA", Subdivision: "CA-QC", Types: []string{"public"}}}, nil, jun24, jun24)
	on, _ := c.Resolve([]Policy{{Country: "CA", Subdivision: "CA-ON", Types: []string{"public"}}}, nil, jun24, jun24)
	if len(qc) == 0 || len(on) != 0 {
		t.Fatalf("24 de junio: QC=%v ON=%v", qc, on)
	}
}

func TestFeriadosPropiosYPaisesDesconocidos(t *testing.T) {
	c := catalog(t)
	fixed := domain.Date{Year: 2026, Month: time.March, Day: 3}
	ms, err := c.Resolve(nil, []Custom{{Name: "Aniversario", MonthDay: "12-24"}, {Name: "Inventario", Date: &fixed}},
		domain.Date{Year: 2026, Month: time.January, Day: 1}, domain.Date{Year: 2027, Month: time.December, Day: 31})
	if err != nil || len(ms) != 3 {
		t.Fatalf("propios: %v %v", ms, err)
	}
	if _, err := c.Country("ZZ"); err == nil {
		t.Fatal("ZZ no existe")
	}
	if !c.HasCountry("CA", "CA-QC") || c.HasCountry("CA", "CA-XX") {
		t.Fatal("HasCountry")
	}
	if len(c.Countries("es")) < 150 {
		t.Fatal("se esperaban más de 150 países")
	}
}
