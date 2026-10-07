package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
)

// Feed es un feed ICS.
type Feed struct {
	ID             string
	OrgID          string
	CalendarID     string
	CustomerUserID string
	Scope          string
	Locale         string
	Label          string
	CreatedAt      time.Time
	RevokedAt      *time.Time
}

const feedColumns = `id, org_id, coalesce(calendar_id::text, ''), coalesce(customer_user_id::text, ''), scope, locale,
	coalesce(label, ''), created_at, revoked_at`

func scanFeed(row pgx.Row) (Feed, error) {
	var f Feed
	err := row.Scan(&f.ID, &f.OrgID, &f.CalendarID, &f.CustomerUserID, &f.Scope, &f.Locale, &f.Label, &f.CreatedAt, &f.RevokedAt)
	return f, notFound(err)
}

// InsertFeed crea un feed con el hash de su token.
func InsertFeed(ctx context.Context, q DBTX, f Feed, tokenHash, createdBy string) (Feed, error) {
	return scanFeed(q.QueryRow(ctx, `insert into ics_feeds (org_id, calendar_id, customer_user_id, scope, locale, token_hash, label, created_by)
		values ($1, nullif($2, '')::uuid, nullif($3, '')::uuid, $4, $5, $6, nullif($7, ''), $8) returning `+feedColumns,
		f.OrgID, f.CalendarID, f.CustomerUserID, f.Scope, f.Locale, tokenHash, f.Label, createdBy))
}

// FeedByToken devuelve un feed vigente por el hash de su token.
func FeedByToken(ctx context.Context, q DBTX, tokenHash string) (Feed, error) {
	return scanFeed(q.QueryRow(ctx, `select `+feedColumns+` from ics_feeds where token_hash = $1 and revoked_at is null`, tokenHash))
}

// GetFeed devuelve un feed por id.
func GetFeed(ctx context.Context, q DBTX, id string) (Feed, error) {
	return scanFeed(q.QueryRow(ctx, `select `+feedColumns+` from ics_feeds where id = $1`, id))
}

// ListFeeds devuelve los feeds vigentes de un tablero o los personales de un cliente en una organización.
func ListFeeds(ctx context.Context, q DBTX, calendarID, orgID, customerID string) ([]Feed, error) {
	rows, err := q.Query(ctx, `select `+feedColumns+` from ics_feeds where revoked_at is null
		and (($1 <> '' and calendar_id::text = $1) or ($3 <> '' and org_id::text = $2 and customer_user_id::text = $3))
		order by created_at`, calendarID, orgID, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Feed
	for rows.Next() {
		f, err := scanFeed(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// RevokeFeed revoca un feed.
func RevokeFeed(ctx context.Context, q DBTX, id string) error {
	_, err := q.Exec(ctx, `update ics_feeds set revoked_at = now() where id = $1 and revoked_at is null`, id)
	return err
}

// OrgEventsOfCustomer devuelve las citas confirmadas de un cliente final en los tableros de una organización.
func OrgEventsOfCustomer(ctx context.Context, q DBTX, orgID, customerID string, from, to time.Time) ([]Event, error) {
	return collectEvents(q.Query(ctx, `select `+eventColumns+` from events where status = 'confirmed' and customer_user_id::text = $2
		and calendar_id in (select id from calendars where org_id::text = $1) and during && tstzrange($3, $4)
		order by lower(during)`, orgID, customerID, from, to))
}

// Connection es una conexión directa con un proveedor.
type Connection struct {
	ID          string
	CalendarID  string
	Provider    string
	Account     string
	Status      string
	Credentials []byte
	KeyID       string
	LastSyncAt  *time.Time
	LastError   string
	LastErrorAt *time.Time
	BusyUntil   *time.Time
	CreatedBy   string
}

const connColumns = `id, calendar_id, provider, account, status, credentials, key_id, last_sync_at, coalesce(last_error, ''),
	last_error_at, busy_until, created_by`

func scanConn(row pgx.Row) (Connection, error) {
	var c Connection
	err := row.Scan(&c.ID, &c.CalendarID, &c.Provider, &c.Account, &c.Status, &c.Credentials, &c.KeyID, &c.LastSyncAt,
		&c.LastError, &c.LastErrorAt, &c.BusyUntil, &c.CreatedBy)
	return c, notFound(err)
}

func collectConns(rows pgx.Rows, err error) ([]Connection, error) {
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Connection
	for rows.Next() {
		c, err := scanConn(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// UpsertConnection crea o reactiva una conexión (misma cuenta y proveedor en el tablero).
func UpsertConnection(ctx context.Context, q DBTX, c Connection) (Connection, error) {
	return scanConn(q.QueryRow(ctx, `insert into connections (calendar_id, provider, account, credentials, key_id, created_by)
		values ($1, $2, $3, $4, $5, $6)
		on conflict (calendar_id, provider, account) do update set credentials = excluded.credentials,
		key_id = excluded.key_id, status = 'active', last_error = null, last_error_at = null
		returning `+connColumns, c.CalendarID, c.Provider, c.Account, c.Credentials, c.KeyID, c.CreatedBy))
}

// GetConnection devuelve una conexión.
func GetConnection(ctx context.Context, q DBTX, id string) (Connection, error) {
	return scanConn(q.QueryRow(ctx, `select `+connColumns+` from connections where id = $1`, id))
}

// ListConnections devuelve las conexiones de un tablero.
func ListConnections(ctx context.Context, q DBTX, calendarID string) ([]Connection, error) {
	return collectConns(q.Query(ctx, `select `+connColumns+` from connections where calendar_id = $1 order by created_at`, calendarID))
}

// ActiveConnections devuelve las conexiones activas (de un tablero o todas).
func ActiveConnections(ctx context.Context, q DBTX, calendarID string) ([]Connection, error) {
	return collectConns(q.Query(ctx, `select `+connColumns+` from connections where status = 'active'
		and ($1 = '' or calendar_id::text = $1) order by created_at`, calendarID))
}

// SetCredentials guarda credenciales renovadas.
func SetCredentials(ctx context.Context, q DBTX, id string, sealed []byte, keyID string) error {
	_, err := q.Exec(ctx, `update connections set credentials = $2, key_id = $3 where id = $1`, id, sealed, keyID)
	return err
}

// SetConnectionHealth registra el resultado de una sincronización.
func SetConnectionHealth(ctx context.Context, q DBTX, id, status, lastError string, now time.Time) error {
	if lastError == "" {
		_, err := q.Exec(ctx, `update connections set status = $2, last_sync_at = $3 where id = $1`, id, status, now)
		return err
	}
	_, err := q.Exec(ctx, `update connections set status = $2, last_error = $3, last_error_at = $4 where id = $1`, id, status, lastError, now)
	return err
}

// DeleteConnection borra una conexión (cascada a sus calendarios, ocupado y enlaces).
func DeleteConnection(ctx context.Context, q DBTX, id string) error {
	_, err := q.Exec(ctx, `delete from connections where id = $1`, id)
	return err
}

// ExternalCalendar es un calendario del proveedor dentro de una conexión.
type ExternalCalendar struct {
	ID               string
	ConnectionID     string
	ExternalID       string
	Name             string
	UseAsBusy        bool
	WriteTarget      bool
	AppCreated       bool
	SyncToken        string
	ChannelID        string
	ChannelResource  string
	ChannelExpiresAt *time.Time
	CTag             string
}

const extColumns = `id, connection_id, external_id, name, use_as_busy, write_target, app_created, coalesce(sync_token, ''),
	coalesce(channel_id, ''), coalesce(channel_resource, ''), channel_expires_at, coalesce(ctag, '')`

func scanExt(row pgx.Row) (ExternalCalendar, error) {
	var e ExternalCalendar
	err := row.Scan(&e.ID, &e.ConnectionID, &e.ExternalID, &e.Name, &e.UseAsBusy, &e.WriteTarget, &e.AppCreated, &e.SyncToken,
		&e.ChannelID, &e.ChannelResource, &e.ChannelExpiresAt, &e.CTag)
	return e, notFound(err)
}

// UpsertExternalCalendar guarda un calendario del proveedor (conserva las preferencias si ya existía).
func UpsertExternalCalendar(ctx context.Context, q DBTX, e ExternalCalendar) (ExternalCalendar, error) {
	return scanExt(q.QueryRow(ctx, `insert into external_calendars (connection_id, external_id, name, use_as_busy, write_target, app_created)
		values ($1, $2, $3, $4, $5, $6)
		on conflict (connection_id, external_id) do update set name = excluded.name,
		write_target = external_calendars.write_target or excluded.write_target,
		app_created = external_calendars.app_created or excluded.app_created
		returning `+extColumns, e.ConnectionID, e.ExternalID, e.Name, e.UseAsBusy, e.WriteTarget, e.AppCreated))
}

// ExternalCalendars devuelve los calendarios de una conexión.
func ExternalCalendars(ctx context.Context, q DBTX, connectionID string) ([]ExternalCalendar, error) {
	rows, err := q.Query(ctx, `select `+extColumns+` from external_calendars where connection_id = $1 order by app_created desc, name`, connectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ExternalCalendar
	for rows.Next() {
		e, err := scanExt(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// UpdateExternalCalendar cambia el uso de un calendario; un solo destino de escritura por conexión.
func UpdateExternalCalendar(ctx context.Context, q DBTX, connectionID, id string, busy, write bool) error {
	if write {
		if _, err := q.Exec(ctx, `update external_calendars set write_target = false where connection_id = $1`, connectionID); err != nil {
			return err
		}
	}
	tag, err := q.Exec(ctx, `update external_calendars set use_as_busy = $3, write_target = $4 where connection_id = $1 and id = $2`,
		connectionID, id, busy, write)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// SetChannel guarda el canal de avisos (Google) o la suscripción (Microsoft) de un calendario.
func SetChannel(ctx context.Context, q DBTX, extID, channelID, resource string, expires time.Time) error {
	_, err := q.Exec(ctx, `update external_calendars set channel_id = $2, channel_resource = $3, channel_expires_at = $4 where id = $1`,
		extID, channelID, resource, expires)
	return err
}

// ConnectionByChannel encuentra la conexión (y el calendario externo) de un canal o suscripción.
func ConnectionByChannel(ctx context.Context, q DBTX, channelID string) (connID, extID string, err error) {
	err = q.QueryRow(ctx, `select connection_id, id from external_calendars where channel_id = $1`, channelID).Scan(&connID, &extID)
	return connID, extID, notFound(err)
}

// ReplaceBusy guarda el ocupado externo de una conexión para un rango (borra el anterior del rango).
func ReplaceBusy(ctx context.Context, tx pgx.Tx, connectionID, calendarID string, from, to time.Time, busy []domain.Interval, now time.Time) error {
	if _, err := tx.Exec(ctx, `delete from external_busy where connection_id = $1 and during && tstzrange($2, $3)`, connectionID, from, to); err != nil {
		return err
	}
	for _, b := range busy {
		if !b.End.After(b.Start) {
			continue
		}
		if _, err := tx.Exec(ctx, `insert into external_busy (connection_id, calendar_id, during, fetched_at) values ($1, $2, tstzrange($3, $4), $5)`,
			connectionID, calendarID, b.Start, b.End, now); err != nil {
			return err
		}
	}
	_, err := tx.Exec(ctx, `update connections set busy_until = $2 where id = $1`, connectionID, now.Add(5*time.Minute))
	return err
}

// ExternalBusy devuelve el ocupado externo de un tablero en un rango (de conexiones activas).
func ExternalBusy(ctx context.Context, q DBTX, calendarID string, from, to time.Time) ([]domain.Interval, error) {
	rows, err := q.Query(ctx, `select lower(b.during), upper(b.during) from external_busy b join connections c on c.id = b.connection_id
		where b.calendar_id = $1 and c.status = 'active' and b.during && tstzrange($2, $3)`, calendarID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Interval
	for rows.Next() {
		var s, e time.Time
		if err := rows.Scan(&s, &e); err != nil {
			return nil, err
		}
		out = append(out, domain.Interval{Start: s.UTC(), End: e.UTC()})
	}
	return out, rows.Err()
}

// Link une un evento nuestro con su copia en el proveedor.
type Link struct {
	EventID      string
	ConnectionID string
	ExternalID   string
	ETag         string
	SyncedStart  time.Time
	SyncedEnd    time.Time
	Deleted      bool
}

// GetLink devuelve el enlace de un evento en una conexión.
func GetLink(ctx context.Context, q DBTX, eventID, connectionID string) (Link, error) {
	var l Link
	err := q.QueryRow(ctx, `select event_id, connection_id, external_id, coalesce(etag, ''), synced_start, synced_end, deleted
		from external_links where event_id = $1 and connection_id = $2`, eventID, connectionID).
		Scan(&l.EventID, &l.ConnectionID, &l.ExternalID, &l.ETag, &l.SyncedStart, &l.SyncedEnd, &l.Deleted)
	return l, notFound(err)
}

// SaveLink guarda o actualiza un enlace.
func SaveLink(ctx context.Context, q DBTX, l Link) error {
	_, err := q.Exec(ctx, `insert into external_links (event_id, connection_id, external_id, etag, synced_start, synced_end, deleted)
		values ($1, $2, $3, nullif($4, ''), $5, $6, $7)
		on conflict (event_id, connection_id) do update set external_id = excluded.external_id, etag = excluded.etag,
		synced_start = excluded.synced_start, synced_end = excluded.synced_end, deleted = excluded.deleted, updated_at = now()`,
		l.EventID, l.ConnectionID, l.ExternalID, l.ETag, l.SyncedStart, l.SyncedEnd, l.Deleted)
	return err
}

// LinksOfConnection devuelve los enlaces vigentes de una conexión cuyos eventos terminan después de `from`.
func LinksOfConnection(ctx context.Context, q DBTX, connectionID string, from time.Time) ([]Link, error) {
	rows, err := q.Query(ctx, `select l.event_id, l.connection_id, l.external_id, coalesce(l.etag, ''), l.synced_start, l.synced_end, l.deleted
		from external_links l join events e on e.id = l.event_id
		where l.connection_id = $1 and not l.deleted and upper(e.during) >= $2`, connectionID, from)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Link
	for rows.Next() {
		var l Link
		if err := rows.Scan(&l.EventID, &l.ConnectionID, &l.ExternalID, &l.ETag, &l.SyncedStart, &l.SyncedEnd, &l.Deleted); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// EventsToPush devuelve los eventos confirmados de un tablero en un rango que deberían estar en el proveedor.
func EventsToPush(ctx context.Context, q DBTX, calendarID string, from, to time.Time) ([]Event, error) {
	return collectEvents(q.Query(ctx, `select `+eventColumns+` from events where calendar_id = $1 and status = 'confirmed'
		and during && tstzrange($2, $3) order by lower(during)`, calendarID, from, to))
}

// LinksOfCancelled devuelve enlaces vigentes cuyos eventos ya no están confirmados (hay que borrarlos fuera).
func LinksOfCancelled(ctx context.Context, q DBTX, connectionID string) ([]Link, error) {
	rows, err := q.Query(ctx, `select l.event_id, l.connection_id, l.external_id, coalesce(l.etag, ''), l.synced_start, l.synced_end, l.deleted
		from external_links l join events e on e.id = l.event_id
		where l.connection_id = $1 and not l.deleted and e.status <> 'confirmed'`, connectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Link
	for rows.Next() {
		var l Link
		if err := rows.Scan(&l.EventID, &l.ConnectionID, &l.ExternalID, &l.ETag, &l.SyncedStart, &l.SyncedEnd, &l.Deleted); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}
