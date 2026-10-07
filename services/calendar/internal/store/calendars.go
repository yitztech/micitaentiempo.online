package store

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// EmbedPolicy controla en qué sitios se puede incrustar el tablero.
type EmbedPolicy struct {
	Mode    string   `json:"mode"`
	Origins []string `json:"origins,omitempty"`
}

// BookingPolicy son las reglas de autoservicio del cliente final.
type BookingPolicy struct {
	CancelMinNoticeMinutes int `json:"cancel_min_notice_minutes,omitempty"`
}

// Calendar es un tablero.
type Calendar struct {
	ID            string
	OrgID         string
	Slug          string
	Name          string
	Timezone      string
	Capacity      int
	Country       string
	Subdivision   string
	Address       string
	EmbedPolicy   EmbedPolicy
	BookingPolicy BookingPolicy
	Status        string
	CreatedAt     time.Time
	OrgStatus     string
}

const calendarColumns = `c.id, c.org_id, c.slug, c.name, c.timezone, c.capacity, coalesce(c.country, ''),
	coalesce(c.subdivision, ''), coalesce(c.address, ''), c.embed_policy, c.booking_policy, c.status, c.created_at, o.status`

func scanCalendar(row pgx.Row) (Calendar, error) {
	var c Calendar
	var embed, booking []byte
	if err := row.Scan(&c.ID, &c.OrgID, &c.Slug, &c.Name, &c.Timezone, &c.Capacity, &c.Country, &c.Subdivision,
		&c.Address, &embed, &booking, &c.Status, &c.CreatedAt, &c.OrgStatus); err != nil {
		return Calendar{}, notFound(err)
	}
	_ = json.Unmarshal(embed, &c.EmbedPolicy)
	_ = json.Unmarshal(booking, &c.BookingPolicy)
	if c.EmbedPolicy.Mode == "" {
		c.EmbedPolicy.Mode = "any"
	}
	return c, nil
}

// NewCalendar son los datos de alta.
type NewCalendar struct {
	OrgID, OrgStatus, Name, Slug, Timezone, Country, Subdivision, Address string
	Capacity                                                              int
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// CreateCalendar crea el tablero; si el slug está ocupado prueba con sufijos.
func (s *Store) CreateCalendar(ctx context.Context, in NewCalendar) (Calendar, error) {
	base := in.Slug
	if base == "" {
		base = Slugify(in.Name)
	}
	var out Calendar
	err := s.tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `insert into org_status (org_id, status) values ($1, $2)
			on conflict (org_id) do update set status = excluded.status, updated_at = now()`, in.OrgID, in.OrgStatus); err != nil {
			return err
		}
		// Primero base, base-2…base-5; después un sufijo aleatorio corto (nombres comunes se repiten mucho).
		for i := 0; i < 25; i++ {
			slug := base
			switch {
			case i >= 5:
				slug = fmt.Sprintf("%s-%s", base, randomSuffix())
			case i > 0:
				slug = fmt.Sprintf("%s-%d", base, i+1)
			}
			var id string
			err := tx.QueryRow(ctx, `insert into calendars (org_id, slug, name, timezone, capacity, country, subdivision, address)
				values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (slug) do nothing returning id`,
				in.OrgID, slug, in.Name, in.Timezone, in.Capacity, nullable(in.Country), nullable(in.Subdivision), nullable(in.Address)).Scan(&id)
			if err == nil {
				var err2 error
				out, err2 = scanCalendar(tx.QueryRow(ctx, `select `+calendarColumns+` from calendars c join org_status o using (org_id) where c.id = $1`, id))
				return err2
			}
			if !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
			if in.Slug != "" {
				return ErrConflict // slug elegido explícitamente y ocupado
			}
		}
		return ErrConflict
	})
	return out, err
}

// GetCalendar devuelve un tablero por id.
func (s *Store) GetCalendar(ctx context.Context, id string) (Calendar, error) {
	return scanCalendar(s.Pool.QueryRow(ctx, `select `+calendarColumns+` from calendars c join org_status o using (org_id) where c.id = $1`, id))
}

// GetCalendarBySlug devuelve un tablero por su slug público.
func (s *Store) GetCalendarBySlug(ctx context.Context, slug string) (Calendar, error) {
	return scanCalendar(s.Pool.QueryRow(ctx, `select `+calendarColumns+` from calendars c join org_status o using (org_id) where c.slug = $1`, slug))
}

// ListCalendars devuelve los tableros de una organización.
func (s *Store) ListCalendars(ctx context.Context, orgID string, includeArchived bool) ([]Calendar, error) {
	rows, err := s.Pool.Query(ctx, `select `+calendarColumns+` from calendars c join org_status o using (org_id)
		where c.org_id = $1 and ($2 or c.status = 'active') order by c.created_at`, orgID, includeArchived)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Calendar
	for rows.Next() {
		c, err := scanCalendar(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// CalendarPatch son los cambios de un tablero (nil = sin cambio).
type CalendarPatch struct {
	Name, Slug, Timezone, Country, Subdivision, Address *string
	Capacity                                            *int
	EmbedPolicy                                         *EmbedPolicy
	BookingPolicy                                       *BookingPolicy
}

// UpdateCalendar aplica los cambios.
func (s *Store) UpdateCalendar(ctx context.Context, id string, p CalendarPatch) (Calendar, error) {
	var embed, booking any
	if p.EmbedPolicy != nil {
		b, _ := json.Marshal(p.EmbedPolicy)
		embed = b
	}
	if p.BookingPolicy != nil {
		b, _ := json.Marshal(p.BookingPolicy)
		booking = b
	}
	_, err := s.Pool.Exec(ctx, `update calendars set
		name = coalesce($2, name), slug = coalesce($3, slug), timezone = coalesce($4, timezone),
		country = case when $5::text is null then country else nullif($5, '') end,
		subdivision = case when $6::text is null then subdivision else nullif($6, '') end,
		address = case when $7::text is null then address else nullif($7, '') end,
		capacity = coalesce($8, capacity),
		embed_policy = coalesce($9::jsonb, embed_policy), booking_policy = coalesce($10::jsonb, booking_policy),
		updated_at = now() where id = $1`,
		id, p.Name, p.Slug, p.Timezone, p.Country, p.Subdivision, p.Address, p.Capacity, embed, booking)
	if isUnique(err) {
		return Calendar{}, ErrConflict
	}
	if err != nil {
		return Calendar{}, err
	}
	return s.GetCalendar(ctx, id)
}

// SetArchived archiva o reactiva un tablero.
func (s *Store) SetArchived(ctx context.Context, id string, archived bool) (Calendar, error) {
	status := "active"
	if archived {
		status = "archived"
	}
	if _, err := s.Pool.Exec(ctx, `update calendars set status = $2, updated_at = now() where id = $1`, id, status); err != nil {
		return Calendar{}, err
	}
	return s.GetCalendar(ctx, id)
}

// SetOrgStatus refleja el estado de la organización.
func (s *Store) SetOrgStatus(ctx context.Context, orgID, status string) error {
	_, err := s.Pool.Exec(ctx, `insert into org_status (org_id, status) values ($1, $2)
		on conflict (org_id) do update set status = excluded.status, updated_at = now()`, orgID, status)
	return err
}

// randomSuffix devuelve 5 caracteres en minúsculas y cifras para desambiguar slugs.
func randomSuffix() string {
	const alphabet = "abcdefghijkmnpqrstuvwxyz23456789"
	b := make([]byte, 5)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(b)
}
