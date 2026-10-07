package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/availability"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
)

// DBTX es lo común a una transacción y al pool.
type DBTX interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Errores de eventos.
var (
	// ErrOverlap: la restricción EXCLUDE impidió solapar dos citas en el mismo asiento.
	ErrOverlap = errors.New("solape de citas")
	// ErrVersion: alguien cambió el evento antes (concurrencia optimista).
	ErrVersion = errors.New("versión desactualizada")
)

// Attendee es la copia mínima de los datos del asistente.
type Attendee struct {
	Name     string `json:"name,omitempty"`
	Email    string `json:"email,omitempty"`
	Phone    string `json:"phone,omitempty"`
	Locale   string `json:"locale,omitempty"`
	Timezone string `json:"tz,omitempty"`
}

// Event es un evento del tablero (cita o bloqueo).
type Event struct {
	ID              string
	CalendarID      string
	Kind            string
	Status          string
	Start, End      time.Time
	AllDay          bool
	Seat            int
	SeriesID        string
	RecurrenceID    *time.Time
	IsException     bool
	ServiceID       string
	BufferBeforeMin int
	BufferAfterMin  int
	Title           string
	CustomerUserID  string
	Attendee        Attendee
	CustomerNotes   string
	InternalNotes   string
	Attendance      string
	CreatedBy       string
	CreatedVia      string
	HoldExpiresAt   *time.Time
	ICalUID         string
	ICalSequence    int
	Version         int
	IdempotencyKey  string
	CreatedAt       time.Time
	CancelledAt     *time.Time
	CancelReason    string
}

const eventColumns = `id, calendar_id, kind, status, lower(during), upper(during), all_day, seat,
	coalesce(series_id::text, ''), recurrence_id, is_exception, coalesce(service_id::text, ''), buffer_before_min,
	buffer_after_min, coalesce(title, ''), coalesce(customer_user_id::text, ''), coalesce(attendee, '{}'::jsonb),
	coalesce(customer_notes, ''), coalesce(internal_notes, ''), coalesce(attendance, ''), created_by, created_via,
	hold_expires_at, ical_uid, ical_sequence, version, coalesce(idempotency_key, ''), created_at, cancelled_at,
	coalesce(cancel_reason, '')`

func scanEvent(row pgx.Row) (Event, error) {
	var e Event
	var attendee []byte
	if err := row.Scan(&e.ID, &e.CalendarID, &e.Kind, &e.Status, &e.Start, &e.End, &e.AllDay, &e.Seat, &e.SeriesID,
		&e.RecurrenceID, &e.IsException, &e.ServiceID, &e.BufferBeforeMin, &e.BufferAfterMin, &e.Title, &e.CustomerUserID,
		&attendee, &e.CustomerNotes, &e.InternalNotes, &e.Attendance, &e.CreatedBy, &e.CreatedVia, &e.HoldExpiresAt,
		&e.ICalUID, &e.ICalSequence, &e.Version, &e.IdempotencyKey, &e.CreatedAt, &e.CancelledAt, &e.CancelReason); err != nil {
		return Event{}, notFound(err)
	}
	_ = json.Unmarshal(attendee, &e.Attendee)
	e.Start, e.End = e.Start.UTC(), e.End.UTC()
	return e, nil
}

func collectEvents(rows pgx.Rows, err error) ([]Event, error) {
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Event
	for rows.Next() {
		e, err := scanEvent(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// InTx ejecuta fn en una transacción.
func (s *Store) InTx(ctx context.Context, fn func(pgx.Tx) error) error {
	return pgx.BeginFunc(ctx, s.Pool, fn)
}

// LockCalendar serializa todas las escrituras que cambian la ocupación de un tablero (§4.7).
func LockCalendar(ctx context.Context, tx pgx.Tx, calendarID string) error {
	_, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtextextended('cal:' || $1, 0))`, calendarID)
	return err
}

// ExpireHolds cancela los holds caducados (de un tablero o de todos si calendarID es "").
func ExpireHolds(ctx context.Context, q DBTX, calendarID string, now time.Time) (int64, error) {
	tag, err := q.Exec(ctx, `update events set status = 'cancelled', hold_expires_at = null, cancelled_at = $2,
		cancel_reason = 'hold_expired', updated_at = now()
		where status = 'held' and hold_expires_at <= $2 and ($1 = '' or calendar_id::text = $1)`, calendarID, now)
	return tag.RowsAffected(), err
}

// LoadOccupancy devuelve las citas vivas (con sus márgenes y asiento) y los bloqueos de un rango.
func LoadOccupancy(ctx context.Context, q DBTX, calendarID string, from, to, now time.Time) ([]availability.Appointment, []domain.Interval, error) {
	rows, err := q.Query(ctx, `select id, kind, lower(during), upper(during), seat, coalesce(service_id::text, ''),
		buffer_before_min, buffer_after_min from events
		where calendar_id = $1 and during && tstzrange($2, $3)
		and (status = 'confirmed' or (status = 'held' and hold_expires_at > $4))`, calendarID, from, to, now)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	var appts []availability.Appointment
	var blocks []domain.Interval
	for rows.Next() {
		var id, kind, svc string
		var s, e time.Time
		var seat, bb, ba int
		if err := rows.Scan(&id, &kind, &s, &e, &seat, &svc, &bb, &ba); err != nil {
			return nil, nil, err
		}
		iv := domain.Interval{Start: s.UTC(), End: e.UTC()}
		if kind == "block" {
			blocks = append(blocks, iv)
			continue
		}
		appts = append(appts, availability.Appointment{ID: id, Interval: iv, Seat: seat, ServiceID: svc,
			BufferBefore: time.Duration(bb) * time.Minute, BufferAfter: time.Duration(ba) * time.Minute})
	}
	return appts, blocks, rows.Err()
}

// InsertEvent inserta un evento; devuelve ErrOverlap si la restricción EXCLUDE lo impide.
func InsertEvent(ctx context.Context, q DBTX, e Event) (Event, error) {
	attendee, _ := json.Marshal(e.Attendee)
	row := q.QueryRow(ctx, `insert into events (calendar_id, kind, status, during, all_day, seat, series_id, recurrence_id,
		is_exception, service_id, buffer_before_min, buffer_after_min, title, customer_user_id, attendee, customer_notes,
		internal_notes, created_by, created_via, hold_expires_at, ical_uid, idempotency_key)
		values ($1, $2, $3, tstzrange($4, $5), $6, $7, nullif($8, '')::uuid, $9, $10, nullif($11, '')::uuid, $12, $13,
		nullif($14, ''), nullif($15, '')::uuid, $16, nullif($17, ''), nullif($18, ''), $19, $20, $21,
		coalesce(nullif($22, ''), gen_random_uuid()::text || '@micitaentiempo'), nullif($23, ''))
		returning `+eventColumns,
		e.CalendarID, e.Kind, e.Status, e.Start, e.End, e.AllDay, e.Seat, e.SeriesID, e.RecurrenceID, e.IsException,
		e.ServiceID, e.BufferBeforeMin, e.BufferAfterMin, e.Title, e.CustomerUserID, attendee, e.CustomerNotes,
		e.InternalNotes, e.CreatedBy, e.CreatedVia, e.HoldExpiresAt, e.ICalUID, e.IdempotencyKey)
	out, err := scanEvent(row)
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23P01" {
		return Event{}, ErrOverlap
	}
	if isUnique(err) {
		return Event{}, ErrConflict
	}
	return out, err
}

// GetEvent devuelve un evento.
func GetEvent(ctx context.Context, q DBTX, id string) (Event, error) {
	return scanEvent(q.QueryRow(ctx, `select `+eventColumns+` from events where id = $1`, id))
}

// GetEventForUpdate bloquea la fila del evento.
func GetEventForUpdate(ctx context.Context, q DBTX, id string) (Event, error) {
	return scanEvent(q.QueryRow(ctx, `select `+eventColumns+` from events where id = $1 for update`, id))
}

// EventByIdempotency devuelve el evento creado con esa clave (reintentos).
func EventByIdempotency(ctx context.Context, q DBTX, calendarID, key string) (Event, error) {
	return scanEvent(q.QueryRow(ctx, `select `+eventColumns+` from events where calendar_id = $1 and idempotency_key = $2`, calendarID, key))
}

// ListEvents devuelve los eventos de un rango; customerUserID limita a los de un cliente final.
func ListEvents(ctx context.Context, q DBTX, calendarID string, from, to time.Time, customerUserID string, includeCancelled bool) ([]Event, error) {
	return collectEvents(q.Query(ctx, `select `+eventColumns+` from events
		where calendar_id = $1 and during && tstzrange($2, $3) and ($4 = '' or customer_user_id::text = $4)
		and ($5 or status <> 'cancelled') order by lower(during), seat`, calendarID, from, to, customerUserID, includeCancelled))
}

// ListCustomerEvents devuelve las reservaciones de un cliente final (opcionalmente de una organización).
func ListCustomerEvents(ctx context.Context, q DBTX, customerUserID, orgID string, from time.Time) ([]Event, error) {
	return collectEvents(q.Query(ctx, `select `+eventColumns+` from events e
		where e.customer_user_id = $1 and upper(e.during) >= $3 and e.status <> 'cancelled'
		and ($2 = '' or e.calendar_id in (select id from calendars where org_id::text = $2))
		order by lower(e.during)`, customerUserID, orgID, from))
}

// EventChange es un cambio de un evento con concurrencia optimista.
type EventChange struct {
	Start, End      *time.Time
	Seat            *int
	Status          *string
	Title           *string
	Attendee        *Attendee
	InternalNotes   *string
	Attendance      *string
	IsException     *bool
	CancelReason    *string
	CustomerUserID  *string
	CustomerNotes   *string
	ClearHold       bool
	BumpICal        bool
	ExpectedVersion int
	// Now es el instante de la cancelación (reloj del motor).
	Now time.Time
}

// UpdateEvent aplica un cambio; ErrVersion si la versión no coincide, ErrOverlap si choca.
func UpdateEvent(ctx context.Context, q DBTX, id string, c EventChange) (Event, error) {
	var attendee any
	if c.Attendee != nil {
		b, _ := json.Marshal(c.Attendee)
		attendee = b
	}
	var cancelledAt any
	if c.Status != nil && *c.Status == "cancelled" {
		cancelledAt = c.Now
		if c.Now.IsZero() {
			cancelledAt = time.Now().UTC()
		}
	}
	row := q.QueryRow(ctx, `update events set
		during = case when $2::timestamptz is null then during else tstzrange($2, $3) end,
		seat = coalesce($4, seat), status = coalesce($5, status), title = coalesce($6, title),
		attendee = coalesce($7::jsonb, attendee), internal_notes = coalesce($8, internal_notes),
		attendance = case when $9::text is null then attendance else nullif($9, '') end,
		is_exception = coalesce($10, is_exception), cancel_reason = coalesce($11, cancel_reason),
		cancelled_at = coalesce($12, cancelled_at),
		hold_expires_at = case when $13 then null else hold_expires_at end,
		ical_sequence = ical_sequence + case when $14 then 1 else 0 end,
		customer_user_id = coalesce(nullif($16, '')::uuid, customer_user_id),
		customer_notes = coalesce($17, customer_notes),
		version = version + 1, updated_at = now()
		where id = $1 and ($15 = 0 or version = $15) returning `+eventColumns,
		id, c.Start, c.End, c.Seat, c.Status, c.Title, attendee, c.InternalNotes, c.Attendance, c.IsException,
		c.CancelReason, cancelledAt, c.ClearHold, c.BumpICal, c.ExpectedVersion, c.CustomerUserID, c.CustomerNotes)
	out, err := scanEvent(row)
	var pg *pgconn.PgError
	switch {
	case errors.As(err, &pg) && pg.Code == "23P01":
		return Event{}, ErrOverlap
	case errors.Is(err, ErrNotFound) && c.ExpectedVersion != 0:
		if _, err2 := GetEvent(ctx, q, id); err2 == nil {
			return Event{}, ErrVersion
		}
		return Event{}, ErrNotFound
	}
	return out, err
}

// CountActiveHolds cuenta los holds vigentes de un titular (límite contra abusos).
func CountActiveHolds(ctx context.Context, q DBTX, holderID string, now time.Time) (int, error) {
	var n int
	err := q.QueryRow(ctx, `select count(*) from events where status = 'held' and created_by = $1 and hold_expires_at > $2`,
		holderID, now).Scan(&n)
	return n, err
}

// SeriesRecurrenceIDs devuelve las horas de pared ya materializadas de una serie (cualquier estado).
func SeriesRecurrenceIDs(ctx context.Context, q DBTX, seriesID string) (map[time.Time]bool, error) {
	rows, err := q.Query(ctx, `select recurrence_id from events where series_id = $1 and recurrence_id is not null`, seriesID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[time.Time]bool{}
	for rows.Next() {
		var t time.Time
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		out[t.UTC()] = true
	}
	return out, rows.Err()
}
