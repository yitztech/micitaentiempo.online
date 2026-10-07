// Corredor de escenarios del motor (docs/plan/09-pruebas.md §9.3): casos de negocio en YAML,
// legibles por personas, que ejecutan la disponibilidad con feriados reales.
package escenarios_test

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/availability"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/holidays"
	"go.yaml.in/yaml/v3"
)

type feriado struct {
	Pais       string   `yaml:"pais"`
	Region     string   `yaml:"region"`
	Tipos      []string `yaml:"tipos"`
	Sustitutos *bool    `yaml:"sustitutos"`
}

type propio struct {
	Nombre   string `yaml:"nombre"`
	Fecha    string `yaml:"fecha"`
	CadaAnio string `yaml:"cada_anio"`
}

type excepcion struct {
	Tipo   string   `yaml:"tipo"` // cerrado | horario | abrir_en_feriado
	Tramos []string `yaml:"tramos"`
}

type existente struct {
	Tipo          string `yaml:"tipo"` // cita | bloqueo
	Inicio        string `yaml:"inicio"`
	Fin           string `yaml:"fin"`
	Asiento       int    `yaml:"asiento"`
	Servicio      string `yaml:"servicio"`
	MargenAntes   int    `yaml:"margen_antes"`
	MargenDespues int    `yaml:"margen_despues"`
}

type dia struct {
	Incluye []string `yaml:"incluye"`
	Excluye []string `yaml:"excluye"`
	Total   *int     `yaml:"total"`
	Vacio   bool     `yaml:"vacio"`
	Primero string   `yaml:"primero"`
	Ultimo  string   `yaml:"ultimo"`
}

type escenario struct {
	Nombre  string `yaml:"nombre"`
	Tablero struct {
		Zona        string               `yaml:"zona"`
		Capacidad   int                  `yaml:"capacidad"`
		Horario     map[string][]string  `yaml:"horario"`
		Descansos   map[string][]string  `yaml:"descansos"`
		Feriados    []feriado            `yaml:"feriados"`
		Propios     []propio             `yaml:"propios"`
		Excepciones map[string]excepcion `yaml:"excepciones"`
	} `yaml:"tablero"`
	Servicio struct {
		Duracion         int `yaml:"duracion"`
		MargenAntes      int `yaml:"margen_antes"`
		MargenDespues    int `yaml:"margen_despues"`
		Intervalo        int `yaml:"intervalo"`
		AntelacionMinima int `yaml:"antelacion_minima"`
		VentanaDias      int `yaml:"ventana_dias"`
		LimiteDiario     int `yaml:"limite_diario"`
	} `yaml:"servicio"`
	Ahora      string      `yaml:"ahora"`
	Existentes []existente `yaml:"existentes"`
	Consulta   struct {
		Desde string `yaml:"desde"`
		Hasta string `yaml:"hasta"`
	} `yaml:"consulta"`
	Esperado map[string]dia `yaml:"esperado"`
}

var nombresDia = map[string]int{
	"lunes": 1, "martes": 2, "miercoles": 3, "miércoles": 3, "jueves": 4, "viernes": 5,
	"sabado": 6, "sábado": 6, "domingo": 7,
}

func dias(clave string) ([]int, error) {
	if clave == "todos" {
		return []int{1, 2, 3, 4, 5, 6, 7}, nil
	}
	if a, b, ok := strings.Cut(clave, "-"); ok {
		ia, oka := nombresDia[a]
		ib, okb := nombresDia[b]
		if !oka || !okb || ib < ia {
			return nil, fmt.Errorf("rango de días no válido: %s", clave)
		}
		var out []int
		for d := ia; d <= ib; d++ {
			out = append(out, d)
		}
		return out, nil
	}
	if d, ok := nombresDia[clave]; ok {
		return []int{d}, nil
	}
	return nil, fmt.Errorf("día no válido: %s", clave)
}

func tramo(s string) (availability.ClockRange, error) {
	a, b, ok := strings.Cut(s, "-")
	if !ok {
		return availability.ClockRange{}, fmt.Errorf("tramo no válido: %s", s)
	}
	ca, err := domain.ParseClock(a)
	if err != nil {
		return availability.ClockRange{}, err
	}
	cb, err := domain.ParseClock(b)
	return availability.ClockRange{Start: ca, End: cb}, err
}

func run(t *testing.T, path string, catalog *holidays.Catalog) {
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var e escenario
	dec := yaml.NewDecoder(strings.NewReader(string(raw)))
	dec.KnownFields(true)
	if err := dec.Decode(&e); err != nil {
		t.Fatalf("YAML: %v", err)
	}
	loc, err := time.LoadLocation(e.Tablero.Zona)
	if err != nil {
		t.Fatal(err)
	}
	in := availability.Input{Location: loc, Capacity: max(e.Tablero.Capacidad, 1), Weekly: map[int][]availability.Shift{}}
	add := func(m map[string][]string, kind availability.ShiftKind) {
		for k, tramos := range m {
			ds, err := dias(k)
			if err != nil {
				t.Fatal(err)
			}
			for _, s := range tramos {
				r, err := tramo(s)
				if err != nil {
					t.Fatal(err)
				}
				for _, d := range ds {
					in.Weekly[d] = append(in.Weekly[d], availability.Shift{Kind: kind, Range: r})
				}
			}
		}
	}
	add(e.Tablero.Horario, availability.Open)
	add(e.Tablero.Descansos, availability.Break)

	desde, err := domain.ParseDate(e.Consulta.Desde)
	if err != nil {
		t.Fatal(err)
	}
	hasta, err := domain.ParseDate(e.Consulta.Hasta)
	if err != nil {
		t.Fatal(err)
	}
	var pols []holidays.Policy
	for _, f := range e.Tablero.Feriados {
		tipos := f.Tipos
		if len(tipos) == 0 {
			tipos = []string{"public"}
		}
		pols = append(pols, holidays.Policy{Country: f.Pais, Subdivision: f.Region, Types: tipos, Substitutes: f.Sustitutos == nil || *f.Sustitutos})
	}
	var customs []holidays.Custom
	for _, p := range e.Tablero.Propios {
		c := holidays.Custom{Name: p.Nombre, MonthDay: p.CadaAnio}
		if p.Fecha != "" {
			d, err := domain.ParseDate(p.Fecha)
			if err != nil {
				t.Fatal(err)
			}
			c.Date = &d
		}
		customs = append(customs, c)
	}
	matches, err := catalog.Resolve(pols, customs, desde.AddDays(-1), hasta.AddDays(1))
	if err != nil {
		t.Fatal(err)
	}
	in.Holidays = holidays.Dates(matches)
	in.Overrides = map[domain.Date]availability.Override{}
	for k, x := range e.Tablero.Excepciones {
		d, err := domain.ParseDate(k)
		if err != nil {
			t.Fatal(err)
		}
		ov := availability.Override{}
		switch x.Tipo {
		case "cerrado":
			ov.Kind = availability.Closed
		case "abrir_en_feriado":
			ov.Kind = availability.OpenOnHoliday
		case "horario":
			ov.Kind = availability.Custom
			for _, s := range x.Tramos {
				r, err := tramo(s)
				if err != nil {
					t.Fatal(err)
				}
				ov.Intervals = append(ov.Intervals, r)
			}
		default:
			t.Fatalf("excepción desconocida %q", x.Tipo)
		}
		in.Overrides[d] = ov
	}
	min := func(n int) time.Duration { return time.Duration(n) * time.Minute }
	in.Service = availability.Service{
		ID: "servicio", Duration: min(e.Servicio.Duracion), BufferBefore: min(e.Servicio.MargenAntes),
		BufferAfter: min(e.Servicio.MargenDespues), Step: min(e.Servicio.Intervalo), MinNotice: min(e.Servicio.AntelacionMinima),
		MaxAdvanceDays: e.Servicio.VentanaDias, DailyLimit: e.Servicio.LimiteDiario,
	}
	if in.Service.MaxAdvanceDays == 0 {
		in.Service.MaxAdvanceDays = 365
	}
	if in.Now, err = time.Parse(time.RFC3339, e.Ahora); err != nil {
		t.Fatal(err)
	}
	for _, x := range e.Existentes {
		ini, err1 := time.Parse(time.RFC3339, x.Inicio)
		fin, err2 := time.Parse(time.RFC3339, x.Fin)
		if err1 != nil || err2 != nil {
			t.Fatalf("existente con fechas no válidas: %+v", x)
		}
		iv := domain.Interval{Start: ini.UTC(), End: fin.UTC()}
		switch x.Tipo {
		case "cita":
			svc := x.Servicio
			if svc == "" {
				svc = "servicio"
			}
			in.Appointments = append(in.Appointments, availability.Appointment{
				Interval: iv, Seat: max(x.Asiento, 1), ServiceID: svc,
				BufferBefore: min(x.MargenAntes), BufferAfter: min(x.MargenDespues),
			})
		case "bloqueo":
			in.Blocks = append(in.Blocks, iv)
		default:
			t.Fatalf("existente desconocido %q", x.Tipo)
		}
	}
	in.From, _ = domain.Resolve(desde, 0, loc)
	in.To, _ = domain.Resolve(hasta.AddDays(1), 0, loc)

	porDia := map[string][]string{}
	for _, s := range availability.Compute(in) {
		lw := s.Start.In(loc)
		k := domain.DateOf(lw).String()
		porDia[k] = append(porDia[k], fmt.Sprintf("%02d:%02d", lw.Hour(), lw.Minute()))
	}
	for k, want := range e.Esperado {
		got := porDia[k]
		if want.Vacio && len(got) > 0 {
			t.Errorf("%s: se esperaba sin huecos, hay %d: %v", k, len(got), got)
		}
		if want.Total != nil && len(got) != *want.Total {
			t.Errorf("%s: %d huecos, se esperaban %d: %v", k, len(got), *want.Total, got)
		}
		for _, h := range want.Incluye {
			if !slices.Contains(got, h) {
				t.Errorf("%s: falta %s en %v", k, h, got)
			}
		}
		for _, h := range want.Excluye {
			if slices.Contains(got, h) {
				t.Errorf("%s: no debería estar %s", k, h)
			}
		}
		if want.Primero != "" && (len(got) == 0 || got[0] != want.Primero) {
			t.Errorf("%s: primer hueco %v, se esperaba %s", k, got, want.Primero)
		}
		if want.Ultimo != "" && (len(got) == 0 || got[len(got)-1] != want.Ultimo) {
			t.Errorf("%s: último hueco %v, se esperaba %s", k, got, want.Ultimo)
		}
	}
}

func TestEscenarios(t *testing.T) {
	files, err := filepath.Glob("../../testdata/escenarios/*.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if len(files) < 40 {
		t.Fatalf("la biblioteca de escenarios debe tener al menos 40 casos; tiene %d", len(files))
	}
	catalog, err := holidays.NewCatalog()
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range files {
		t.Run(strings.TrimSuffix(filepath.Base(f), ".yaml"), func(t *testing.T) { run(t, f, catalog) })
	}
}
