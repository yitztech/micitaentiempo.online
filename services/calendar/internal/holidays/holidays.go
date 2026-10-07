// Package holidays resuelve los feriados de un tablero a partir de datos generados con
// date-holidays (ADR 0008): un archivo por país, embebido y cargado bajo demanda.
package holidays

import (
	"compress/gzip"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"slices"
	"strings"
	"sync"

	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
)

//go:embed data/*.json.gz
var data embed.FS

// Types son los tipos de feriado que puede bloquear una política.
var Types = []string{"public", "bank", "school", "optional", "observance"}

// ErrUnknownCountry indica un país sin datos.
var ErrUnknownCountry = errors.New("país sin datos de feriados")

// Holiday es un feriado de un país (nacional o de una región).
type Holiday struct {
	Date       domain.Date
	Type       string
	Names      map[string]string
	Substitute bool
	// Region es el código ISO 3166-2 o "" si es nacional.
	Region string
}

// Name devuelve el nombre en el idioma pedido (o en español).
func (h Holiday) Name(lang string) string {
	if n := h.Names[lang]; n != "" {
		return n
	}
	return h.Names["es"]
}

// Policy indica qué feriados bloquean un tablero.
type Policy struct {
	Country     string
	Subdivision string
	Types       []string
	Substitutes bool
}

// Custom es un feriado propio del tablero: una fecha concreta o un día de cada año ("MM-DD").
type Custom struct {
	Name     string
	Date     *domain.Date
	MonthDay string
}

// Match es un feriado que aplica a un tablero en una fecha.
type Match struct {
	Date   domain.Date
	Names  map[string]string
	Source string // código de país o "custom"
	Type   string
}

type fileHoliday struct {
	D string            `json:"d"`
	T string            `json:"t"`
	N map[string]string `json:"n"`
	S bool              `json:"s"`
	R string            `json:"r"`
}

type fileCountry struct {
	Country  string        `json:"country"`
	Years    []int         `json:"years"`
	Holidays []fileHoliday `json:"holidays"`
}

// Subdivision es una región de un país.
type Subdivision struct {
	Code  string
	Names map[string]string
}

// Country describe un país con datos.
type Country struct {
	Code         string
	Names        map[string]string
	Subdivisions []Subdivision
}

// Catalog carga países bajo demanda con una caché pequeña (respeta mem_limit).
type Catalog struct {
	mu      sync.Mutex
	cache   map[string][]Holiday
	order   []string
	maxSize int
	index   map[string]Country
	years   []int
}

// NewCatalog lee el índice de países.
func NewCatalog() (*Catalog, error) {
	var idx struct {
		Years     []int `json:"years"`
		Countries map[string]struct {
			Names        map[string]string            `json:"names"`
			Subdivisions map[string]map[string]string `json:"subdivisions"`
		} `json:"countries"`
	}
	if err := readGz("data/index.json.gz", &idx); err != nil {
		return nil, err
	}
	c := &Catalog{cache: map[string][]Holiday{}, maxSize: 30, index: map[string]Country{}, years: idx.Years}
	for code, v := range idx.Countries {
		country := Country{Code: code, Names: v.Names}
		for sc, names := range v.Subdivisions {
			country.Subdivisions = append(country.Subdivisions, Subdivision{Code: sc, Names: names})
		}
		slices.SortFunc(country.Subdivisions, func(a, b Subdivision) int { return strings.Compare(a.Code, b.Code) })
		c.index[code] = country
	}
	return c, nil
}

// Years devuelve los años cubiertos por los datos.
func (c *Catalog) Years() []int { return slices.Clone(c.years) }

// Countries devuelve los países ordenados por nombre en el idioma pedido.
func (c *Catalog) Countries(lang string) []Country {
	out := make([]Country, 0, len(c.index))
	for _, v := range c.index {
		out = append(out, v)
	}
	slices.SortFunc(out, func(a, b Country) int { return strings.Compare(a.Names[lang], b.Names[lang]) })
	return out
}

// HasCountry indica si hay datos del país (y, si se pide, de la región).
func (c *Catalog) HasCountry(code, subdivision string) bool {
	country, ok := c.index[code]
	if !ok || subdivision == "" {
		return ok
	}
	return slices.ContainsFunc(country.Subdivisions, func(s Subdivision) bool { return s.Code == subdivision })
}

// Country devuelve los feriados del país (nacionales y regionales).
func (c *Catalog) Country(code string) ([]Holiday, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if hs, ok := c.cache[code]; ok {
		c.touch(code)
		return hs, nil
	}
	if _, ok := c.index[code]; !ok {
		return nil, fmt.Errorf("%w: %s", ErrUnknownCountry, code)
	}
	var f fileCountry
	if err := readGz("data/"+code+".json.gz", &f); err != nil {
		return nil, err
	}
	hs := make([]Holiday, 0, len(f.Holidays))
	for _, h := range f.Holidays {
		d, err := domain.ParseDate(h.D)
		if err != nil {
			return nil, err
		}
		hs = append(hs, Holiday{Date: d, Type: h.T, Names: h.N, Substitute: h.S, Region: h.R})
	}
	c.cache[code] = hs
	c.touch(code)
	if len(c.order) > c.maxSize {
		delete(c.cache, c.order[0])
		c.order = c.order[1:]
	}
	return hs, nil
}

func (c *Catalog) touch(code string) {
	c.order = slices.DeleteFunc(c.order, func(s string) bool { return s == code })
	c.order = append(c.order, code)
}

// Resolve devuelve los feriados que aplican en [from, to] según las políticas y los propios.
func (c *Catalog) Resolve(policies []Policy, customs []Custom, from, to domain.Date) ([]Match, error) {
	var out []Match
	for _, p := range policies {
		hs, err := c.Country(p.Country)
		if err != nil {
			return nil, err
		}
		for _, h := range hs {
			if h.Date.Before(from) || h.Date.After(to) {
				continue
			}
			if h.Region != "" && h.Region != p.Subdivision {
				continue
			}
			if h.Substitute && !p.Substitutes {
				continue
			}
			if !slices.Contains(p.Types, h.Type) {
				continue
			}
			out = append(out, Match{Date: h.Date, Names: h.Names, Source: p.Country, Type: h.Type})
		}
	}
	for _, cu := range customs {
		names := map[string]string{"es": cu.Name, "en": cu.Name}
		if cu.Date != nil {
			if !cu.Date.Before(from) && !cu.Date.After(to) {
				out = append(out, Match{Date: *cu.Date, Names: names, Source: "custom", Type: "custom"})
			}
			continue
		}
		for d := from; !d.After(to); d = d.AddDays(1) {
			if d.MonthDay() == cu.MonthDay {
				out = append(out, Match{Date: d, Names: names, Source: "custom", Type: "custom"})
			}
		}
	}
	slices.SortFunc(out, func(a, b Match) int { return strings.Compare(a.Date.String(), b.Date.String()) })
	return out, nil
}

// Dates convierte coincidencias en el conjunto de fechas bloqueadas.
func Dates(ms []Match) map[domain.Date]bool {
	out := make(map[domain.Date]bool, len(ms))
	for _, m := range ms {
		out[m.Date] = true
	}
	return out
}

func readGz(name string, v any) error {
	f, err := data.Open(name)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("%w: %s", ErrUnknownCountry, name)
		}
		return err
	}
	defer func() { _ = f.Close() }()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer func() { _ = gz.Close() }()
	return json.NewDecoder(gz).Decode(v)
}
