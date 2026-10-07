package engine

import (
	"context"
	"encoding/json"
	"errors"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	calendarv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/calendar/v1"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/extsync"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/store"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// SyncServer implementa mcet.calendar.v1.SyncService.
type SyncServer struct{ *Engine }

func (s SyncServer) syncer() (*extsync.Syncer, error) {
	if s.Sync == nil {
		return nil, fail(connect.CodeUnavailable, "sync_disabled", "sincronización no disponible")
	}
	return s.Sync, nil
}

func (s SyncServer) connectionView(ctx context.Context, c store.Connection) (*calendarv1.Connection, error) {
	exts, err := store.ExternalCalendars(ctx, s.Store.Pool, c.ID)
	if err != nil {
		return nil, err
	}
	out := &calendarv1.Connection{Id: c.ID, CalendarId: c.CalendarID, Provider: c.Provider, Account: c.Account, Status: c.Status,
		LastSyncAt: ts(c.LastSyncAt), LastError: c.LastError, LastErrorAt: ts(c.LastErrorAt)}
	for _, x := range exts {
		out.Calendars = append(out.Calendars, &calendarv1.ExternalCalendar{Id: x.ID, ExternalId: x.ExternalID, Name: x.Name,
			UseAsBusy: x.UseAsBusy, WriteTarget: x.WriteTarget, AppCreated: x.AppCreated})
	}
	return out, nil
}

// connectionOf carga una conexión y exige ser propietario de su tablero.
func (s SyncServer) connectionOf(ctx context.Context, id string) (store.Connection, error) {
	if err := validUUID(id, "connection_not_found"); err != nil {
		return store.Connection{}, err
	}
	conn, err := store.GetConnection(ctx, s.Store.Pool, id)
	if errors.Is(err, store.ErrNotFound) {
		return conn, fail(connect.CodeNotFound, "connection_not_found", "conexión")
	}
	if err != nil {
		return conn, err
	}
	if _, _, err := s.calendar(ctx, conn.CalendarID, true); err != nil {
		return conn, err
	}
	return conn, nil
}

// UpsertConnection guarda la conexión (credenciales cifradas) y la prepara. Solo el propietario.
func (s SyncServer) UpsertConnection(ctx context.Context, req *calendarv1.UpsertConnectionRequest) (*calendarv1.Connection, error) {
	sy, err := s.syncer()
	if err != nil {
		return nil, err
	}
	c, a, err := s.calendar(ctx, req.GetCalendarId(), true)
	if err != nil {
		return nil, err
	}
	switch req.GetProvider() {
	case "google", "microsoft", "icloud":
	default:
		return nil, fail(connect.CodeInvalidArgument, "invalid_provider", "%q", req.GetProvider())
	}
	var cr extsync.Credentials
	if err := json.Unmarshal(req.GetCredentials(), &cr); err != nil || (cr.RefreshToken == "" && cr.AccessToken == "" && cr.Password == "") {
		return nil, fail(connect.CodeInvalidArgument, "invalid_credentials", "credenciales")
	}
	sealed, kid, err := sy.Sealer.Seal(req.GetCredentials())
	if err != nil {
		return nil, err
	}
	conn, err := store.UpsertConnection(ctx, s.Store.Pool, store.Connection{CalendarID: c.ID, Provider: req.GetProvider(),
		Account: req.GetAccount(), Credentials: sealed, KeyID: kid, CreatedBy: a.UserID})
	if err != nil {
		return nil, err
	}
	if err := sy.Setup(ctx, conn); err != nil {
		if errors.Is(err, extsync.ErrRevoked) {
			_ = store.DeleteConnection(ctx, s.Store.Pool, conn.ID)
			return nil, fail(connect.CodeFailedPrecondition, "invalid_credentials", "el proveedor rechazó las credenciales")
		}
		sy.Log.Warn("preparar conexión", "conexion", conn.ID, "err", err)
	}
	conn, err = store.GetConnection(ctx, s.Store.Pool, conn.ID)
	if err != nil {
		return nil, err
	}
	return s.connectionView(ctx, conn)
}

// ListConnections: el personal ve el estado de las conexiones del tablero (salud visible).
func (s SyncServer) ListConnections(ctx context.Context, req *calendarv1.ListConnectionsRequest) (*calendarv1.ListConnectionsResponse, error) {
	c, a, err := s.calendar(ctx, req.GetCalendarId(), false)
	if err != nil {
		return nil, err
	}
	if err := requireOrg(a, c.OrgID, "owner", "editor", "observer"); err != nil {
		return nil, err
	}
	conns, err := store.ListConnections(ctx, s.Store.Pool, c.ID)
	if err != nil {
		return nil, err
	}
	out := &calendarv1.ListConnectionsResponse{}
	for _, cn := range conns {
		v, err := s.connectionView(ctx, cn)
		if err != nil {
			return nil, err
		}
		out.Connections = append(out.Connections, v)
	}
	return out, nil
}

func (s SyncServer) UpdateExternalCalendar(ctx context.Context, req *calendarv1.UpdateExternalCalendarRequest) (*calendarv1.Connection, error) {
	conn, err := s.connectionOf(ctx, req.GetConnectionId())
	if err != nil {
		return nil, err
	}
	if err := validUUID(req.GetExternalCalendarId(), "calendar_not_found"); err != nil {
		return nil, err
	}
	if err := store.UpdateExternalCalendar(ctx, s.Store.Pool, conn.ID, req.GetExternalCalendarId(), req.GetUseAsBusy(), req.GetWriteTarget()); err != nil {
		return nil, storeErr(err)
	}
	if sy, err := s.syncer(); err == nil {
		_ = sy.EnqueueReconcile(ctx, conn.ID)
	}
	return s.connectionView(ctx, conn)
}

func (s SyncServer) DeleteConnection(ctx context.Context, req *calendarv1.DeleteConnectionRequest) (*calendarv1.DeleteConnectionResponse, error) {
	conn, err := s.connectionOf(ctx, req.GetConnectionId())
	if err != nil {
		return nil, err
	}
	return &calendarv1.DeleteConnectionResponse{}, store.DeleteConnection(ctx, s.Store.Pool, conn.ID)
}

// ResyncConnection reconcilia ya (botón «Sincronizar ahora»).
func (s SyncServer) ResyncConnection(ctx context.Context, req *calendarv1.ResyncConnectionRequest) (*calendarv1.Connection, error) {
	sy, err := s.syncer()
	if err != nil {
		return nil, err
	}
	conn, err := s.connectionOf(ctx, req.GetConnectionId())
	if err != nil {
		return nil, err
	}
	if err := sy.Reconcile(ctx, conn.ID); err != nil && !errors.Is(err, extsync.ErrRevoked) {
		sy.Log.Warn("reconciliar", "conexion", conn.ID, "err", err)
	}
	conn, err = store.GetConnection(ctx, s.Store.Pool, conn.ID)
	if err != nil {
		return nil, err
	}
	return s.connectionView(ctx, conn)
}

func feedView(f store.Feed) *calendarv1.Feed {
	return &calendarv1.Feed{Id: f.ID, CalendarId: f.CalendarID, Scope: f.Scope, Label: f.Label, CreatedAt: timestamppb.New(f.CreatedAt)}
}

// CreateFeed: feed del tablero (personal del negocio) o feed personal de un cliente final.
func (s SyncServer) CreateFeed(ctx context.Context, req *calendarv1.CreateFeedRequest) (*calendarv1.CreateFeedResponse, error) {
	a, err := actorOf(ctx)
	if err != nil {
		return nil, err
	}
	locale := req.GetLocale()
	if locale != "en" {
		locale = "es"
	}
	f := store.Feed{Scope: req.GetScope(), Locale: locale, Label: req.GetLabel()}
	switch f.Scope {
	case "personal":
		if a.Role != "customer" || a.UserID == "" {
			return nil, fail(connect.CodePermissionDenied, "permission_denied", "solo clientes finales")
		}
		if err := validUUID(req.GetOrgId(), "org_not_found"); err != nil {
			return nil, err
		}
		f.OrgID, f.CustomerUserID = req.GetOrgId(), a.UserID
	case "full", "busy":
		c, _, err := s.calendar(ctx, req.GetCalendarId(), false)
		if err != nil {
			return nil, err
		}
		if err := requireOrg(a, c.OrgID, "owner", "editor", "observer"); err != nil {
			return nil, err
		}
		f.OrgID, f.CalendarID = c.OrgID, c.ID
	default:
		return nil, fail(connect.CodeInvalidArgument, "invalid_scope", "%q", f.Scope)
	}
	token, hash := extsync.NewToken()
	saved, err := store.InsertFeed(ctx, s.Store.Pool, f, hash, a.UserID)
	if err != nil {
		return nil, err
	}
	return &calendarv1.CreateFeedResponse{Feed: feedView(saved), Token: token}, nil
}

func (s SyncServer) ListFeeds(ctx context.Context, req *calendarv1.ListFeedsRequest) (*calendarv1.ListFeedsResponse, error) {
	a, err := actorOf(ctx)
	if err != nil {
		return nil, err
	}
	var feeds []store.Feed
	if a.Role == "customer" {
		feeds, err = store.ListFeeds(ctx, s.Store.Pool, "", req.GetOrgId(), a.UserID)
	} else {
		c, _, cerr := s.calendar(ctx, req.GetCalendarId(), false)
		if cerr != nil {
			return nil, cerr
		}
		if err := requireOrg(a, c.OrgID, "owner", "editor", "observer"); err != nil {
			return nil, err
		}
		feeds, err = store.ListFeeds(ctx, s.Store.Pool, c.ID, "", "")
	}
	if err != nil {
		return nil, err
	}
	out := &calendarv1.ListFeedsResponse{}
	for _, f := range feeds {
		out.Feeds = append(out.Feeds, feedView(f))
	}
	return out, nil
}

// RevokeFeed: lo revoca quien lo creó o el propietario del tablero.
func (s SyncServer) RevokeFeed(ctx context.Context, req *calendarv1.RevokeFeedRequest) (*calendarv1.RevokeFeedResponse, error) {
	a, err := actorOf(ctx)
	if err != nil {
		return nil, err
	}
	if err := validUUID(req.GetId(), "feed_not_found"); err != nil {
		return nil, err
	}
	f, err := store.GetFeed(ctx, s.Store.Pool, req.GetId())
	if err != nil {
		return nil, fail(connect.CodeNotFound, "feed_not_found", "feed")
	}
	owner := a.Role == "owner" && a.OrgID == f.OrgID
	mine := f.CustomerUserID != "" && f.CustomerUserID == a.UserID
	if !owner && !mine && a.Role != "system" {
		// Creador del feed (personal del negocio).
		var createdBy string
		_ = s.Store.Pool.QueryRow(ctx, `select created_by from ics_feeds where id = $1`, f.ID).Scan(&createdBy)
		if createdBy != a.UserID || a.OrgID != f.OrgID {
			return nil, fail(connect.CodeNotFound, "feed_not_found", "feed")
		}
	}
	return &calendarv1.RevokeFeedResponse{}, store.RevokeFeed(ctx, s.Store.Pool, f.ID)
}

// validUUID responde «no existe» ante ids mal formados (sin filtrar errores de la base de datos).
func validUUID(id, reason string) error {
	if _, err := uuid.Parse(id); err != nil {
		return fail(connect.CodeNotFound, reason, "%s", reason)
	}
	return nil
}
