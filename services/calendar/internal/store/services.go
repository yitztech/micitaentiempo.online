package store

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5"
)

// Service es un tipo de cita.
type Service struct {
	ID              string
	CalendarID      string
	Name            map[string]string
	Description     map[string]string
	DurationMin     int
	BufferBeforeMin int
	BufferAfterMin  int
	MinNoticeMin    int
	MaxAdvanceDays  int
	SlotStepMin     int
	DailyLimit      int
	Color           string
	Active          bool
	Position        int
}

const serviceColumns = `id, calendar_id, name, coalesce(description, '{}'::jsonb), duration_min, buffer_before_min,
	buffer_after_min, min_notice_min, max_advance_days, slot_step_min, coalesce(daily_limit, 0), color, active, position`

func scanService(row pgx.Row) (Service, error) {
	var sv Service
	var name, desc []byte
	if err := row.Scan(&sv.ID, &sv.CalendarID, &name, &desc, &sv.DurationMin, &sv.BufferBeforeMin, &sv.BufferAfterMin,
		&sv.MinNoticeMin, &sv.MaxAdvanceDays, &sv.SlotStepMin, &sv.DailyLimit, &sv.Color, &sv.Active, &sv.Position); err != nil {
		return Service{}, notFound(err)
	}
	_ = json.Unmarshal(name, &sv.Name)
	_ = json.Unmarshal(desc, &sv.Description)
	return sv, nil
}

// ListServices devuelve los servicios ordenados.
func (s *Store) ListServices(ctx context.Context, calendarID string, includeInactive bool) ([]Service, error) {
	rows, err := s.Pool.Query(ctx, `select `+serviceColumns+` from services where calendar_id = $1 and ($2 or active)
		order by position, id`, calendarID, includeInactive)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Service
	for rows.Next() {
		sv, err := scanService(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, sv)
	}
	return out, rows.Err()
}

// GetService devuelve un servicio de un tablero.
func (s *Store) GetService(ctx context.Context, calendarID, id string) (Service, error) {
	return scanService(s.Pool.QueryRow(ctx, `select `+serviceColumns+` from services where calendar_id = $1 and id = $2`, calendarID, id))
}

func nullLimit(n int) any {
	if n <= 0 {
		return nil
	}
	return n
}

// CreateService da de alta un servicio al final de la lista.
func (s *Store) CreateService(ctx context.Context, sv Service) (Service, error) {
	name, _ := json.Marshal(sv.Name)
	desc, _ := json.Marshal(sv.Description)
	return scanService(s.Pool.QueryRow(ctx, `insert into services (calendar_id, name, description, duration_min,
		buffer_before_min, buffer_after_min, min_notice_min, max_advance_days, slot_step_min, daily_limit, color, active, position)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
			(select coalesce(max(position) + 1, 0) from services where calendar_id = $1))
		returning `+serviceColumns,
		sv.CalendarID, name, desc, sv.DurationMin, sv.BufferBeforeMin, sv.BufferAfterMin, sv.MinNoticeMin,
		sv.MaxAdvanceDays, sv.SlotStepMin, nullLimit(sv.DailyLimit), sv.Color, sv.Active))
}

// UpdateService sustituye los datos de un servicio.
func (s *Store) UpdateService(ctx context.Context, sv Service) (Service, error) {
	name, _ := json.Marshal(sv.Name)
	desc, _ := json.Marshal(sv.Description)
	return scanService(s.Pool.QueryRow(ctx, `update services set name = $3, description = $4, duration_min = $5,
		buffer_before_min = $6, buffer_after_min = $7, min_notice_min = $8, max_advance_days = $9, slot_step_min = $10,
		daily_limit = $11, color = $12, active = $13 where calendar_id = $1 and id = $2 returning `+serviceColumns,
		sv.CalendarID, sv.ID, name, desc, sv.DurationMin, sv.BufferBeforeMin, sv.BufferAfterMin, sv.MinNoticeMin,
		sv.MaxAdvanceDays, sv.SlotStepMin, nullLimit(sv.DailyLimit), sv.Color, sv.Active))
}

// DeleteService borra un servicio.
func (s *Store) DeleteService(ctx context.Context, calendarID, id string) error {
	tag, err := s.Pool.Exec(ctx, `delete from services where calendar_id = $1 and id = $2`, calendarID, id)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// ReorderServices fija el orden según la lista de ids.
func (s *Store) ReorderServices(ctx context.Context, calendarID string, ids []string) error {
	return s.tx(ctx, func(tx pgx.Tx) error {
		for i, id := range ids {
			if _, err := tx.Exec(ctx, `update services set position = $3 where calendar_id = $1 and id = $2`, calendarID, id, i); err != nil {
				return err
			}
		}
		return nil
	})
}
