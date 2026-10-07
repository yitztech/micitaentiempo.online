package extsync

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/auth"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/clock"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/config"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/outbox"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/store"
	"golang.org/x/oauth2"
)

// Ventanas de trabajo (04-motor-calendario.md §4.9).
const (
	BusyTTL     = 5 * time.Minute
	BusyWindow  = 14 * 24 * time.Hour
	PushWindow  = 60 * 24 * time.Hour
	liveTimeout = 4 * time.Second
)

// Credentials es lo que llega de api (OAuth) o del formulario de iCloud; se guarda cifrado.
type Credentials struct {
	AccessToken  string    `json:"access_token,omitempty"`
	RefreshToken string    `json:"refresh_token,omitempty"`
	Expiry       time.Time `json:"expiry,omitzero"`
	Username     string    `json:"username,omitempty"`
	Password     string    `json:"password,omitempty"`
}

// Syncer reúne las dependencias de la sincronización.
type Syncer struct {
	Store  *store.Store
	Sealer *Sealer
	Cfg    config.SyncConfig
	Clock  clock.Clock
	Jobs   *river.Client[pgx.Tx]
	HTTP   *http.Client
	Log    *slog.Logger
}

func (s *Syncer) httpClient() *http.Client {
	if s.HTTP != nil {
		return s.HTTP
	}
	return &http.Client{Timeout: 15 * time.Second}
}

// savingSource guarda los tokens renovados para no pedir uno nuevo en cada sincronización.
type savingSource struct {
	src  oauth2.TokenSource
	last string
	save func(*oauth2.Token)
}

func (t *savingSource) Token() (*oauth2.Token, error) {
	tok, err := t.src.Token()
	if err != nil {
		return nil, err
	}
	if tok.AccessToken != t.last {
		t.last = tok.AccessToken
		t.save(tok)
	}
	return tok, nil
}

// Provider construye el cliente del proveedor de una conexión.
func (s *Syncer) Provider(ctx context.Context, conn store.Connection) (Provider, error) {
	plain, err := s.Sealer.Open(conn.Credentials, conn.KeyID)
	if err != nil {
		return nil, fmt.Errorf("credenciales: %w", err)
	}
	var cr Credentials
	if err := json.Unmarshal(plain, &cr); err != nil {
		return nil, err
	}
	base := context.WithValue(ctx, oauth2.HTTPClient, s.httpClient())
	oauthClient := func(id, secret, tokenURL string) *http.Client {
		cfg := &oauth2.Config{ClientID: id, ClientSecret: secret, Endpoint: oauth2.Endpoint{TokenURL: tokenURL, AuthStyle: oauth2.AuthStyleInParams}}
		tok := &oauth2.Token{AccessToken: cr.AccessToken, RefreshToken: cr.RefreshToken, Expiry: cr.Expiry, TokenType: "Bearer"}
		src := &savingSource{src: cfg.TokenSource(base, tok), last: cr.AccessToken, save: func(t *oauth2.Token) {
			next := cr
			next.AccessToken, next.Expiry = t.AccessToken, t.Expiry
			if t.RefreshToken != "" {
				next.RefreshToken = t.RefreshToken
			}
			if b, err := json.Marshal(next); err == nil { //nolint:gosec // se cifra de inmediato (Seal)
				if sealed, kid, err := s.Sealer.Seal(b); err == nil {
					_ = store.SetCredentials(context.WithoutCancel(ctx), s.Store.Pool, conn.ID, sealed, kid)
				}
			}
		}}
		c := oauth2.NewClient(base, src)
		c.Timeout = 15 * time.Second
		return c
	}
	switch conn.Provider {
	case "google":
		return newGoogle(oauthClient(s.Cfg.GoogleClientID, s.Cfg.GoogleClientSecret, s.Cfg.GoogleTokenURL), s.Cfg.GoogleAPIURL), nil
	case "microsoft":
		return newMicrosoft(oauthClient(s.Cfg.MSClientID, s.Cfg.MSClientSecret, s.Cfg.MSTokenURL), s.Cfg.MSGraphURL), nil
	case "icloud":
		return newCalDAV(s.httpClient(), s.Cfg.ICloudCalDAVURL, cr.Username, cr.Password)
	}
	return nil, fmt.Errorf("proveedor %q", conn.Provider)
}

// ChannelToken firma el id de un canal o suscripción para validar los avisos entrantes.
func ChannelToken(secret, channelID string) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(channelID))
	return hex.EncodeToString(m.Sum(nil))[:40]
}

// fail registra el error de una conexión; si la credencial se revocó, la marca y avisa al propietario.
func (s *Syncer) fail(ctx context.Context, conn store.Connection, err error) error {
	now := s.Clock.Now()
	if errors.Is(err, ErrRevoked) {
		_ = store.SetConnectionHealth(ctx, s.Store.Pool, conn.ID, "revoked", "credencial revocada: reconecta la cuenta", now)
		if conn.Status != "revoked" {
			s.emit(ctx, "sync.revoked", conn, nil)
		}
		return err
	}
	_ = store.SetConnectionHealth(ctx, s.Store.Pool, conn.ID, conn.Status, err.Error(), now)
	return err
}

// emit encola un evento de dominio de sincronización (aviso al propietario en api).
func (s *Syncer) emit(ctx context.Context, typ string, conn store.Connection, extra map[string]any) {
	if s.Jobs == nil {
		return
	}
	c, err := s.Store.GetCalendar(ctx, conn.CalendarID)
	if err != nil {
		return
	}
	subject := map[string]any{"connection_id": conn.ID, "provider": conn.Provider, "account": conn.Account, "calendar_name": c.Name, "calendar_timezone": c.Timezone}
	for k, v := range extra {
		subject[k] = v
	}
	_ = s.Store.InTx(ctx, func(tx pgx.Tx) error {
		return outbox.Enqueue(ctx, s.Jobs, tx, outbox.Event{
			EventID: newID(), Type: typ, OccurredAt: s.Clock.Now(), OrgID: c.OrgID, CalendarID: c.ID,
			Actor: auth.ActorClaims{Role: "system", Via: "sync"}, Subject: subject, Version: 1,
		})
	})
}

// Setup prepara una conexión nueva: calendarios, calendario de la app, canal de avisos y primera
// sincronización.
func (s *Syncer) Setup(ctx context.Context, conn store.Connection) error {
	p, err := s.Provider(ctx, conn)
	if err != nil {
		return err
	}
	cals, err := p.ListCalendars(ctx)
	if err != nil {
		return s.fail(ctx, conn, err)
	}
	c, err := s.Store.GetCalendar(ctx, conn.CalendarID)
	if err != nil {
		return err
	}
	app, err := p.EnsureAppCalendar(ctx, "Mi Cita en Tiempo — "+c.Name, c.Timezone)
	if err != nil {
		return s.fail(ctx, conn, err)
	}
	hasWrite := false
	for i, x := range cals {
		if x.ID == app.ID {
			continue
		}
		// Ocupado: el calendario principal (o el primero). En iCloud, el primero editable es además el destino.
		busy := x.Primary || (i == 0 && !anyPrimary(cals))
		write := app.ID == "" && !hasWrite && x.CanEdit && busy
		hasWrite = hasWrite || write
		if _, err := store.UpsertExternalCalendar(ctx, s.Store.Pool, store.ExternalCalendar{ConnectionID: conn.ID, ExternalID: x.ID, Name: x.Name, UseAsBusy: busy, WriteTarget: write}); err != nil {
			return err
		}
	}
	if app.ID != "" {
		ext, err := store.UpsertExternalCalendar(ctx, s.Store.Pool, store.ExternalCalendar{ConnectionID: conn.ID, ExternalID: app.ID, Name: app.Name, WriteTarget: true, AppCreated: true})
		if err != nil {
			return err
		}
		s.watch(ctx, p, conn, ext)
	}
	return s.Reconcile(ctx, conn.ID)
}

func anyPrimary(cals []ExtCal) bool {
	for _, c := range cals {
		if c.Primary {
			return true
		}
	}
	return false
}

// watch abre o renueva el canal de avisos del calendario de la app (si el proveedor lo admite).
func (s *Syncer) watch(ctx context.Context, p Provider, conn store.Connection, ext store.ExternalCalendar) {
	w, ok := p.(Watcher)
	if !ok || s.Cfg.HooksURL == "" {
		return
	}
	channelID := newID()
	secret, path := s.Cfg.GoogleChannelSecret, "/hooks/google"
	if conn.Provider == "microsoft" {
		secret, path = s.Cfg.MSClientState, "/hooks/microsoft"
	}
	// Google firma el id del canal; Graph no conoce el id de la suscripción hasta crearla: se firma el nuestro.
	signed := channelID
	if conn.Provider == "microsoft" {
		signed = ext.ID
	}
	resource, exp, err := w.Watch(ctx, ext.ExternalID, channelID, s.Cfg.HooksURL+path, ChannelToken(secret, signed))
	if err != nil {
		s.Log.Warn("canal de avisos", "conexion", conn.ID, "err", err)
		return
	}
	id := channelID
	if conn.Provider == "microsoft" {
		id = resource // en Graph el aviso trae el id de la suscripción
	}
	_ = store.SetChannel(ctx, s.Store.Pool, ext.ID, id, resource, exp)
}

// RefreshBusy trae el ocupado de los calendarios marcados y lo guarda (sin contar nuestros propios eventos).
func (s *Syncer) RefreshBusy(ctx context.Context, conn store.Connection) error {
	p, err := s.Provider(ctx, conn)
	if err != nil {
		return err
	}
	exts, err := store.ExternalCalendars(ctx, s.Store.Pool, conn.ID)
	if err != nil {
		return err
	}
	var ids []string
	for _, x := range exts {
		if x.UseAsBusy && !x.AppCreated {
			ids = append(ids, x.ExternalID)
		}
	}
	now := s.Clock.Now()
	from, to := now.Add(-time.Hour), now.Add(BusyWindow)
	busy, err := p.FreeBusy(ctx, ids, from, to)
	if err != nil {
		return s.fail(ctx, conn, err)
	}
	links, err := store.LinksOfConnection(ctx, s.Store.Pool, conn.ID, from)
	if err != nil {
		return err
	}
	own := map[[2]int64]bool{}
	for _, l := range links {
		own[[2]int64{l.SyncedStart.Unix(), l.SyncedEnd.Unix()}] = true
	}
	kept := busy[:0]
	for _, b := range busy {
		if !own[[2]int64{b.Start.Unix(), b.End.Unix()}] {
			kept = append(kept, b)
		}
	}
	return s.Store.InTx(ctx, func(tx pgx.Tx) error {
		return store.ReplaceBusy(ctx, tx, conn.ID, conn.CalendarID, from, to, domain.Normalize(kept), now)
	})
}

// EnsureFresh refresca el ocupado de un tablero si caducó (o siempre, con live) con un tiempo máximo:
// si el proveedor no responde a tiempo se usa lo guardado.
func (s *Syncer) EnsureFresh(ctx context.Context, calendarID string, live bool) {
	conns, err := store.ActiveConnections(ctx, s.Store.Pool, calendarID)
	if err != nil || len(conns) == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, liveTimeout)
	defer cancel()
	now := s.Clock.Now()
	for _, c := range conns {
		if live || c.BusyUntil == nil || c.BusyUntil.Before(now) {
			if err := s.RefreshBusy(ctx, c); err != nil {
				s.Log.Warn("ocupado externo", "conexion", c.ID, "err", err)
			}
		}
	}
}

// Busy devuelve el ocupado externo guardado de un tablero (lo usa el cálculo de huecos como bloqueos).
func (s *Syncer) Busy(ctx context.Context, q store.DBTX, calendarID string, from, to time.Time) ([]domain.Interval, error) {
	return store.ExternalBusy(ctx, q, calendarID, from, to)
}

func newID() string {
	b := make([]byte, 16)
	_, _ = randRead(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	h := hex.EncodeToString(b)
	return h[:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:]
}
