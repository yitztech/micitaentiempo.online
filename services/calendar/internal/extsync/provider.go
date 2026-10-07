package extsync

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
)

// Errores clasificados de los proveedores.
var (
	// ErrRevoked: la credencial ya no vale (revocada, contraseña de app cambiada). Hay que reconectar.
	ErrRevoked = errors.New("credencial revocada")
	// ErrRateLimited: cuota agotada; se reintenta con espera exponencial.
	ErrRateLimited = errors.New("límite de peticiones del proveedor")
	// ErrGone: el evento ya no existe en el proveedor.
	ErrGone = errors.New("evento borrado en el proveedor")
)

// ExtCal es un calendario del proveedor.
type ExtCal struct {
	ID      string
	Name    string
	Primary bool
	CanEdit bool
}

// Outgoing es nuestro evento tal como se escribe en el proveedor.
type Outgoing struct {
	EventID     string
	ICalUID     string
	Summary     string
	Description string
	Location    string
	Start, End  time.Time
	Sequence    int
}

// Remote es un evento escrito por nosotros, leído del proveedor.
type Remote struct {
	ID         string
	ETag       string
	Start, End time.Time
	Cancelled  bool
}

// Provider es lo común a Google, Microsoft e iCloud.
type Provider interface {
	ListCalendars(ctx context.Context) ([]ExtCal, error)
	FreeBusy(ctx context.Context, calendarIDs []string, from, to time.Time) ([]domain.Interval, error)
	// EnsureAppCalendar crea (o encuentra) el calendario propio de la app; "" si el proveedor no lo permite.
	EnsureAppCalendar(ctx context.Context, name, timezone string) (ExtCal, error)
	Upsert(ctx context.Context, calendarID, remoteID string, ev Outgoing) (id, etag string, err error)
	Get(ctx context.Context, calendarID, remoteID string) (Remote, error)
	Delete(ctx context.Context, calendarID, remoteID string) error
}

// Watcher es opcional: avisos de cambios (canal de Google, suscripción de Graph).
type Watcher interface {
	Watch(ctx context.Context, calendarID, channelID, address, token string) (resource string, expires time.Time, err error)
}

// restClient hace peticiones JSON y clasifica errores.
type restClient struct {
	http *http.Client
	base string
}

func (r restClient) do(ctx context.Context, method, path string, in, out any) (http.Header, error) {
	var body io.Reader
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return nil, err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, r.base+path, body)
	if err != nil {
		return nil, err
	}
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")
	res, err := r.http.Do(req)
	if err != nil {
		return nil, classifyTransport(err)
	}
	defer func() { _ = res.Body.Close() }()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err := classifyStatus(res.StatusCode, data); err != nil {
		return res.Header, err
	}
	if out != nil && len(data) > 0 {
		if err := json.Unmarshal(data, out); err != nil {
			return res.Header, fmt.Errorf("respuesta inválida: %w", err)
		}
	}
	return res.Header, nil
}

func classifyTransport(err error) error {
	// oauth2 devuelve invalid_grant al refrescar un token revocado.
	var re interface{ Error() string }
	if errors.As(err, &re) && bytes.Contains([]byte(err.Error()), []byte("invalid_grant")) {
		return ErrRevoked
	}
	return err
}

func classifyStatus(status int, body []byte) error {
	switch {
	case status < 300:
		return nil
	case status == http.StatusUnauthorized:
		return ErrRevoked
	case status == http.StatusNotFound || status == http.StatusGone:
		return ErrGone
	case status == http.StatusTooManyRequests,
		status == http.StatusForbidden && bytes.Contains(body, []byte("ateLimit")):
		return ErrRateLimited
	default:
		return fmt.Errorf("proveedor respondió %d: %.200s", status, body)
	}
}
