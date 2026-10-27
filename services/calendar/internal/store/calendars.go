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
	CancelMinNoticeMinutes int    `json:"cancel_min_notice_minutes,omitempty"`
	ContactMode            string `json:"contact_mode,omitempty"`
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
	Status           string
	CreatedAt        time.Time
	OrgStatus        string
	AggregateVersion int
}

// CalendarSnapshot es el estado del agregado tablero/servicios para proyección y reconciliación (ADR 0019).
type CalendarSnapshot struct {
	CalendarID        string
	OrgID             string
	AggregateVersion  int
	State             string // "active", "archived", "deleted"
	Slug              string
	HasActiveServices bool
	UpdatedAt         time.Time
}

const calendarColumns = `c.id, c.org_id, c.slug, c.name, c.timezone, c.capacity, coalesce(c.country, ''),
	coalesce(c.subdivision, ''), coalesce(c.address, ''), c.embed_policy, c.booking_policy, c.status, c.created_at, o.status, c.aggregate_version`

func scanCalendar(row pgx.Row) (Calendar, error) {
	var c Calendar
	var embed, booking []byte
	if err := row.Scan(&c.ID, &c.OrgID, &c.Slug, &c.Name, &c.Timezone, &c.Capacity, &c.Country, &c.Subdivision,
		&c.Address, &embed, &booking, &c.Status, &c.CreatedAt, &c.OrgStatus, &c.AggregateVersion); err != nil {
		return Calendar{}, notFound(err)
	}
	_ = json.Unmarshal(embed, &c.EmbedPolicy)
	_ = json.Unmarshal(booking, &c.BookingPolicy)
	if c.EmbedPolicy.Mode == "" {
		c.EmbedPolicy.Mode = "any"
	}
	if c.BookingPolicy.ContactMode == "" {
		c.BookingPolicy.ContactMode = "email"
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

// CreateCalendarTx crea el tablero dentro de una transacción activa.
func (s *Store) CreateCalendarTx(ctx context.Context, tx pgx.Tx, in NewCalendar) (Calendar, error) {
	base := in.Slug
	if base == "" {
		base = Slugify(in.Name)
	}
	if _, err := tx.Exec(ctx, `insert into org_status (org_id, status) values ($1, $2)
		on conflict (org_id) do update set status = excluded.status, updated_at = now()`, in.OrgID, in.OrgStatus); err != nil {
		return Calendar{}, err
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
		err := tx.QueryRow(ctx, `insert into calendars (org_id, slug, name, timezone, capacity, country, subdivision, address, aggregate_version)
			values ($1, $2, $3, $4, $5, $6, $7, $8, 1) on conflict (slug) do nothing returning id`,
			in.OrgID, slug, in.Name, in.Timezone, in.Capacity, nullable(in.Country), nullable(in.Subdivision), nullable(in.Address)).Scan(&id)
		if err == nil {
			return scanCalendar(tx.QueryRow(ctx, `select `+calendarColumns+` from calendars c join org_status o using (org_id) where c.id = $1`, id))
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return Calendar{}, err
		}
		if in.Slug != "" {
			return Calendar{}, ErrConflict // slug elegido explícitamente y ocupado
		}
	}
	return Calendar{}, ErrConflict
}

// CreateCalendar crea el tablero; si el slug está ocupado prueba con sufijos.
func (s *Store) CreateCalendar(ctx context.Context, in NewCalendar) (Calendar, error) {
	var out Calendar
	err := s.InTx(ctx, func(tx pgx.Tx) error {
		var err error
		out, err = s.CreateCalendarTx(ctx, tx, in)
		return err
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

// UpdateCalendarTx aplica los cambios e incrementa aggregate_version en la transacción.
func (s *Store) UpdateCalendarTx(ctx context.Context, tx pgx.Tx, id string, p CalendarPatch) (Calendar, error) {
	var embed, booking any
	if p.EmbedPolicy != nil {
		b, _ := json.Marshal(p.EmbedPolicy)
		embed = b
	}
	if p.BookingPolicy != nil {
		b, _ := json.Marshal(p.BookingPolicy)
		booking = b
	}
	_, err := tx.Exec(ctx, `update calendars set
		name = coalesce($2, name), slug = coalesce($3, slug), timezone = coalesce($4, timezone),
		country = case when $5::text is null then country else nullif($5, '') end,
		subdivision = case when $6::text is null then subdivision else nullif($6, '') end,
		address = case when $7::text is null then address else nullif($7, '') end,
		capacity = coalesce($8, capacity),
		embed_policy = coalesce($9::jsonb, embed_policy), booking_policy = coalesce($10::jsonb, booking_policy),
		aggregate_version = aggregate_version + 1,
		updated_at = now() where id = $1`,
		id, p.Name, p.Slug, p.Timezone, p.Country, p.Subdivision, p.Address, p.Capacity, embed, booking)
	if isUnique(err) {
		return Calendar{}, ErrConflict
	}
	if err != nil {
		return Calendar{}, err
	}
	return scanCalendar(tx.QueryRow(ctx, `select `+calendarColumns+` from calendars c join org_status o using (org_id) where c.id = $1`, id))
}

// UpdateCalendar aplica los cambios.
func (s *Store) UpdateCalendar(ctx context.Context, id string, p CalendarPatch) (Calendar, error) {
	var out Calendar
	err := s.InTx(ctx, func(tx pgx.Tx) error {
		var err error
		out, err = s.UpdateCalendarTx(ctx, tx, id, p)
		return err
	})
	return out, err
}

// SetArchivedTx archiva o reactiva un tablero e incrementa aggregate_version en la transacción.
func (s *Store) SetArchivedTx(ctx context.Context, tx pgx.Tx, id string, archived bool) (Calendar, error) {
	status := "active"
	if archived {
		status = "archived"
	}
	if _, err := tx.Exec(ctx, `update calendars set status = $2, aggregate_version = aggregate_version + 1, updated_at = now() where id = $1`, id, status); err != nil {
		return Calendar{}, err
	}
	return scanCalendar(tx.QueryRow(ctx, `select `+calendarColumns+` from calendars c join org_status o using (org_id) where c.id = $1`, id))
}

// SetArchived archiva o reactiva un tablero.
func (s *Store) SetArchived(ctx context.Context, id string, archived bool) (Calendar, error) {
	var out Calendar
	err := s.InTx(ctx, func(tx pgx.Tx) error {
		var err error
		out, err = s.SetArchivedTx(ctx, tx, id, archived)
		return err
	})
	return out, err
}

// IncrementCalendarVersionTx incrementa la versión de agregado del tablero cuando cambian sus servicios.
func (s *Store) IncrementCalendarVersionTx(ctx context.Context, tx pgx.Tx, calendarID string) (int, error) {
	var v int
	err := tx.QueryRow(ctx, `update calendars set aggregate_version = aggregate_version + 1, updated_at = now() where id = $1 returning aggregate_version`, calendarID).Scan(&v)
	return v, err
}

// GetCalendarSnapshotTx obtiene el snapshot actual del tablero dentro de una transacción.
func (s *Store) GetCalendarSnapshotTx(ctx context.Context, tx pgx.Tx, calendarID string) (CalendarSnapshot, error) {
	var snap CalendarSnapshot
	err := tx.QueryRow(ctx, `
		select c.id, c.org_id, c.aggregate_version, c.status, c.slug,
		       exists (select 1 from services where calendar_id = c.id and active = true),
		       c.updated_at
		from calendars c
		where c.id = $1`, calendarID).Scan(
		&snap.CalendarID, &snap.OrgID, &snap.AggregateVersion, &snap.State, &snap.Slug,
		&snap.HasActiveServices, &snap.UpdatedAt)
	return snap, notFound(err)
}

// SetOrgStatus refleja el estado de la organización.
func (s *Store) SetOrgStatus(ctx context.Context, orgID, status string) error {
	_, err := s.Pool.Exec(ctx, `insert into org_status (org_id, status) values ($1, $2)
		on conflict (org_id) do update set status = excluded.status, updated_at = now()`, orgID, status)
	return err
}

// PurgeOrgTx registra tombstones, borra los tableros de la organización y devuelve los snapshots de baja.
func (s *Store) PurgeOrgTx(ctx context.Context, tx pgx.Tx, orgID string) (int, []CalendarSnapshot, error) {
	rows, err := tx.Query(ctx, `select id, slug, aggregate_version, now() from calendars where org_id = $1`, orgID)
	if err != nil {
		return 0, nil, err
	}
	defer rows.Close()

	var tombstones []CalendarSnapshot
	for rows.Next() {
		var snap CalendarSnapshot
		var v int
		if err := rows.Scan(&snap.CalendarID, &snap.Slug, &v, &snap.UpdatedAt); err != nil {
			return 0, nil, err
		}
		snap.OrgID = orgID
		snap.AggregateVersion = v + 1
		snap.State = "deleted"
		snap.HasActiveServices = false
		tombstones = append(tombstones, snap)
	}
	if err := rows.Err(); err != nil {
		return 0, nil, err
	}
	rows.Close()

	for _, t := range tombstones {
		if _, err := tx.Exec(ctx, `insert into calendar_tombstones (calendar_id, org_id, slug, aggregate_version, deleted_at)
			values ($1, $2, $3, $4, $5)
			on conflict (calendar_id) do update set aggregate_version = excluded.aggregate_version, deleted_at = excluded.deleted_at`,
			t.CalendarID, t.OrgID, t.Slug, t.AggregateVersion, t.UpdatedAt); err != nil {
			return 0, nil, err
		}
	}

	tag, err := tx.Exec(ctx, `delete from calendars where org_id = $1`, orgID)
	if err != nil {
		return 0, nil, err
	}
	if _, err := tx.Exec(ctx, `delete from org_status where org_id = $1`, orgID); err != nil {
		return 0, nil, err
	}
	return int(tag.RowsAffected()), tombstones, nil
}

// PurgeOrg borra los tableros de la organización (el resto cae en cascada) y su estado.
func (s *Store) PurgeOrg(ctx context.Context, orgID string) (int, error) {
	var n int
	err := s.InTx(ctx, func(tx pgx.Tx) error {
		var err error
		n, _, err = s.PurgeOrgTx(ctx, tx, orgID)
		return err
	})
	return n, err
}

// ListCalendarSnapshots devuelve los snapshots vigentes y tombstones de la organización con paginación keyset.
func (s *Store) ListCalendarSnapshots(ctx context.Context, orgID string, cursor string, limit int) ([]CalendarSnapshot, string, error) {
	if limit <= 0 || limit > 100 {
		limit = 100
	}
	query := `with active_services as (
		select calendar_id, count(*) filter (where active = true) as active_count
		from services
		group by calendar_id
	),
	all_snapshots as (
		select
			c.id::text as calendar_id,
			c.org_id::text as org_id,
			c.aggregate_version,
			c.status as state,
			c.slug,
			coalesce(s.active_count, 0) > 0 as has_active_services,
			c.updated_at
		from calendars c
		left join active_services s on s.calendar_id = c.id
		where c.org_id = $1
		union all
		select
			t.calendar_id::text as calendar_id,
			t.org_id::text as org_id,
			t.aggregate_version,
			'deleted' as state,
			t.slug,
			false as has_active_services,
			t.deleted_at as updated_at
		from calendar_tombstones t
		where t.org_id = $1
	)
	select calendar_id, org_id, aggregate_version, state, slug, has_active_services, updated_at
	from all_snapshots
	where ($2 = '' or calendar_id > $2)
	order by calendar_id asc
	limit $3`

	rows, err := s.Pool.Query(ctx, query, orgID, cursor, limit+1)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	var snaps []CalendarSnapshot
	for rows.Next() {
		var snap CalendarSnapshot
		if err := rows.Scan(&snap.CalendarID, &snap.OrgID, &snap.AggregateVersion, &snap.State, &snap.Slug,
			&snap.HasActiveServices, &snap.UpdatedAt); err != nil {
			return nil, "", err
		}
		snaps = append(snaps, snap)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	nextCursor := ""
	if len(snaps) > limit {
		snaps = snaps[:limit]
		nextCursor = snaps[len(snaps)-1].CalendarID
	}
	return snaps, nextCursor, nil
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
