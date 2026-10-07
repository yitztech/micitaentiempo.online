package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
)

// SeriesTemplate son los datos comunes de las instancias.
type SeriesTemplate struct {
	Title           string   `json:"title,omitempty"`
	ServiceID       string   `json:"service_id,omitempty"`
	CustomerUserID  string   `json:"customer_user_id,omitempty"`
	Attendee        Attendee `json:"attendee"`
	InternalNotes   string   `json:"internal_notes,omitempty"`
	BufferBeforeMin int      `json:"buffer_before_min,omitempty"`
	BufferAfterMin  int      `json:"buffer_after_min,omitempty"`
	CreatedVia      string   `json:"created_via,omitempty"`
}

// Series es una serie recurrente.
type Series struct {
	ID                string
	CalendarID        string
	Kind              string
	RRule             string
	DTStartLocal      time.Time // hora de pared en UTC «ficticio»
	TZID              string
	DurationMin       int
	UntilUTC          *time.Time
	ExdatesLocal      []time.Time
	MaterializedUntil time.Time
	Template          SeriesTemplate
	CreatedBy         string
	Version           int
}

const seriesColumns = `id, calendar_id, kind, rrule, dtstart_local, tzid, duration_min, until_utc, exdates_local,
	materialized_until, template, created_by, version`

func scanSeries(row pgx.Row) (Series, error) {
	var s Series
	var tpl []byte
	if err := row.Scan(&s.ID, &s.CalendarID, &s.Kind, &s.RRule, &s.DTStartLocal, &s.TZID, &s.DurationMin, &s.UntilUTC,
		&s.ExdatesLocal, &s.MaterializedUntil, &tpl, &s.CreatedBy, &s.Version); err != nil {
		return Series{}, notFound(err)
	}
	_ = json.Unmarshal(tpl, &s.Template)
	return s, nil
}

// InsertSeries crea una serie.
func InsertSeries(ctx context.Context, q DBTX, s Series) (Series, error) {
	tpl, _ := json.Marshal(s.Template)
	if s.ExdatesLocal == nil {
		s.ExdatesLocal = []time.Time{}
	}
	return scanSeries(q.QueryRow(ctx, `insert into series (calendar_id, kind, rrule, dtstart_local, tzid, duration_min,
		until_utc, exdates_local, materialized_until, template, created_by)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning `+seriesColumns,
		s.CalendarID, s.Kind, s.RRule, s.DTStartLocal, s.TZID, s.DurationMin, s.UntilUTC, s.ExdatesLocal,
		s.MaterializedUntil, tpl, s.CreatedBy))
}

// GetSeriesForUpdate bloquea y devuelve una serie.
func GetSeriesForUpdate(ctx context.Context, q DBTX, id string) (Series, error) {
	return scanSeries(q.QueryRow(ctx, `select `+seriesColumns+` from series where id = $1 for update`, id))
}

// GetSeries devuelve una serie.
func GetSeries(ctx context.Context, q DBTX, id string) (Series, error) {
	return scanSeries(q.QueryRow(ctx, `select `+seriesColumns+` from series where id = $1`, id))
}

// UpdateSeries guarda regla, fin, exclusiones, plantilla y horizonte.
func UpdateSeries(ctx context.Context, q DBTX, s Series) error {
	tpl, _ := json.Marshal(s.Template)
	_, err := q.Exec(ctx, `update series set rrule = $2, dtstart_local = $3, duration_min = $4, until_utc = $5,
		exdates_local = $6, materialized_until = $7, template = $8, version = version + 1, updated_at = now() where id = $1`,
		s.ID, s.RRule, s.DTStartLocal, s.DurationMin, s.UntilUTC, s.ExdatesLocal, s.MaterializedUntil, tpl)
	return err
}

// SeriesToExtend devuelve series vivas cuyo horizonte materializado quedó corto.
func SeriesToExtend(ctx context.Context, q DBTX, horizon time.Time, limit int) ([]Series, error) {
	rows, err := q.Query(ctx, `select `+seriesColumns+` from series where materialized_until < $1
		and (until_utc is null or until_utc > materialized_until) order by materialized_until limit $2`, horizon, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Series
	for rows.Next() {
		s, err := scanSeries(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// SeriesEvents devuelve las instancias vivas de una serie desde un instante.
func SeriesEvents(ctx context.Context, q DBTX, seriesID string, from time.Time) ([]Event, error) {
	return collectEvents(q.Query(ctx, `select `+eventColumns+` from events where series_id = $1 and lower(during) >= $2
		and status <> 'cancelled' order by lower(during)`, seriesID, from))
}
