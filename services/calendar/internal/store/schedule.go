package store

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5"
)

// Shift es un tramo semanal (abierto o descanso) en hora de pared.
type Shift struct {
	Weekday    int
	Kind       string
	StartLocal string // "HH:MM"
	EndLocal   string // "HH:MM" (PostgreSQL admite "24:00" en columnas time)
	Label      string
}

// TimeRange es un tramo de hora de pared.
type TimeRange struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// DateOverride cambia el horario de una fecha.
type DateOverride struct {
	Date      string
	Kind      string
	Intervals []TimeRange
	Note      string
}

// HolidayPolicy es una política de feriados.
type HolidayPolicy struct {
	Country     string
	Subdivision string
	Types       []string
	Substitutes bool
}

// CustomHoliday es un feriado propio.
type CustomHoliday struct {
	ID       string
	Name     string
	Date     string
	MonthDay string
}

// Schedule es la configuración horaria de un tablero.
type Schedule struct {
	CalendarID string
	Shifts     []Shift
	Overrides  []DateOverride
	Policies   []HolidayPolicy
	Customs    []CustomHoliday
}

// hhmm recorta "HH:MM:SS" de PostgreSQL a "HH:MM".
func hhmm(s string) string {
	if len(s) >= 5 {
		return s[:5]
	}
	return s
}

// GetSchedule lee horario, excepciones (desde una fecha) y feriados de un tablero.
func (s *Store) GetSchedule(ctx context.Context, calendarID string) (Schedule, error) {
	out := Schedule{CalendarID: calendarID}
	rows, err := s.Pool.Query(ctx, `select weekday, kind, start_local::text, end_local::text, coalesce(label, '')
		from hours where calendar_id = $1 order by weekday, start_local`, calendarID)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var sh Shift
		if err := rows.Scan(&sh.Weekday, &sh.Kind, &sh.StartLocal, &sh.EndLocal, &sh.Label); err != nil {
			rows.Close()
			return out, err
		}
		sh.StartLocal, sh.EndLocal = hhmm(sh.StartLocal), hhmm(sh.EndLocal)
		out.Shifts = append(out.Shifts, sh)
	}
	rows.Close()

	rows, err = s.Pool.Query(ctx, `select date_local::text, kind, coalesce(intervals, '[]'::jsonb), coalesce(note, '')
		from date_overrides where calendar_id = $1 order by date_local`, calendarID)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var o DateOverride
		var raw []byte
		if err := rows.Scan(&o.Date, &o.Kind, &raw, &o.Note); err != nil {
			rows.Close()
			return out, err
		}
		_ = json.Unmarshal(raw, &o.Intervals)
		out.Overrides = append(out.Overrides, o)
	}
	rows.Close()

	rows, err = s.Pool.Query(ctx, `select country, subdivision, types, substitutes from holiday_policies
		where calendar_id = $1 order by country, subdivision`, calendarID)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var p HolidayPolicy
		if err := rows.Scan(&p.Country, &p.Subdivision, &p.Types, &p.Substitutes); err != nil {
			rows.Close()
			return out, err
		}
		out.Policies = append(out.Policies, p)
	}
	rows.Close()

	rows, err = s.Pool.Query(ctx, `select id, name, coalesce(date_local::text, ''), coalesce(month_day, '')
		from custom_holidays where calendar_id = $1 order by coalesce(date_local::text, month_day)`, calendarID)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var c CustomHoliday
		if err := rows.Scan(&c.ID, &c.Name, &c.Date, &c.MonthDay); err != nil {
			return out, err
		}
		out.Customs = append(out.Customs, c)
	}
	return out, rows.Err()
}

// ReplaceShifts sustituye el horario semanal completo.
func (s *Store) ReplaceShifts(ctx context.Context, calendarID string, shifts []Shift) error {
	return s.tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `delete from hours where calendar_id = $1`, calendarID); err != nil {
			return err
		}
		for _, sh := range shifts {
			if _, err := tx.Exec(ctx, `insert into hours (calendar_id, weekday, kind, label, start_local, end_local)
				values ($1, $2, $3, nullif($4, ''), $5::time, $6::time)`,
				calendarID, sh.Weekday, sh.Kind, sh.Label, sh.StartLocal, sh.EndLocal); err != nil {
				return err
			}
		}
		return nil
	})
}

// UpsertOverride crea o sustituye la excepción de una fecha.
func (s *Store) UpsertOverride(ctx context.Context, calendarID string, o DateOverride) error {
	raw, _ := json.Marshal(o.Intervals)
	_, err := s.Pool.Exec(ctx, `insert into date_overrides (calendar_id, date_local, kind, intervals, note)
		values ($1, $2::date, $3, $4, nullif($5, ''))
		on conflict (calendar_id, date_local) do update set kind = excluded.kind, intervals = excluded.intervals, note = excluded.note`,
		calendarID, o.Date, o.Kind, raw, o.Note)
	return err
}

// DeleteOverride borra la excepción de una fecha.
func (s *Store) DeleteOverride(ctx context.Context, calendarID, date string) error {
	_, err := s.Pool.Exec(ctx, `delete from date_overrides where calendar_id = $1 and date_local = $2::date`, calendarID, date)
	return err
}

// ReplacePolicies sustituye las políticas de feriados.
func (s *Store) ReplacePolicies(ctx context.Context, calendarID string, ps []HolidayPolicy) error {
	return s.tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `delete from holiday_policies where calendar_id = $1`, calendarID); err != nil {
			return err
		}
		for _, p := range ps {
			if _, err := tx.Exec(ctx, `insert into holiday_policies (calendar_id, country, subdivision, types, substitutes)
				values ($1, $2, $3, $4, $5)`, calendarID, p.Country, p.Subdivision, p.Types, p.Substitutes); err != nil {
				return err
			}
		}
		return nil
	})
}

// UpsertCustom crea o actualiza un feriado propio y devuelve su id.
func (s *Store) UpsertCustom(ctx context.Context, calendarID string, c CustomHoliday) (string, error) {
	var id string
	if c.ID == "" {
		err := s.Pool.QueryRow(ctx, `insert into custom_holidays (calendar_id, name, date_local, month_day)
			values ($1, $2, nullif($3, '')::date, nullif($4, '')) returning id`, calendarID, c.Name, c.Date, c.MonthDay).Scan(&id)
		return id, err
	}
	err := s.Pool.QueryRow(ctx, `update custom_holidays set name = $3, date_local = nullif($4, '')::date, month_day = nullif($5, '')
		where calendar_id = $1 and id = $2 returning id`, calendarID, c.ID, c.Name, c.Date, c.MonthDay).Scan(&id)
	return id, notFound(err)
}

// DeleteCustom borra un feriado propio.
func (s *Store) DeleteCustom(ctx context.Context, calendarID, id string) error {
	_, err := s.Pool.Exec(ctx, `delete from custom_holidays where calendar_id = $1 and id = $2`, calendarID, id)
	return err
}
