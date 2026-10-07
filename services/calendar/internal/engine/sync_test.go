package engine_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	calendarv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/calendar/v1"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/config"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/engine"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/extsync"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/store"
)

// fakeGoogle imita lo mínimo de Google Calendar v3 y su endpoint de tokens.
type fakeGoogle struct {
	mu      sync.Mutex
	busy    []map[string]string
	events  map[string]map[string]any // id → evento en el calendario de la app
	n       int
	revoked bool
	refresh int
}

func (f *fakeGoogle) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	write := func(v any) { w.Header().Set("Content-Type", "application/json"); _ = json.NewEncoder(w).Encode(v) }
	if r.URL.Path == "/token" {
		if f.revoked {
			w.WriteHeader(http.StatusBadRequest)
			write(map[string]string{"error": "invalid_grant"})
			return
		}
		f.refresh++
		write(map[string]any{"access_token": fmt.Sprintf("acceso-%d", f.refresh), "expires_in": 3600, "token_type": "Bearer"})
		return
	}
	if f.revoked || !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer acceso-") {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	p := strings.TrimPrefix(r.URL.Path, "/calendar/v3")
	switch {
	case p == "/users/me/calendarList":
		write(map[string]any{"items": []map[string]any{{"id": "principal@example.com", "summary": "Principal", "primary": true, "accessRole": "owner"}}})
	case p == "/calendars" && r.Method == http.MethodPost:
		write(map[string]any{"id": "app-cal", "summary": "Mi Cita en Tiempo"})
	case p == "/freeBusy":
		write(map[string]any{"calendars": map[string]any{"principal@example.com": map[string]any{"busy": f.busy}}})
	case p == "/calendars/app-cal/events/watch":
		write(map[string]any{"resourceId": "recurso", "expiration": fmt.Sprint(time.Now().Add(7 * 24 * time.Hour).UnixMilli())})
	case p == "/calendars/app-cal/events" && r.Method == http.MethodPost:
		var ev map[string]any
		_ = json.NewDecoder(r.Body).Decode(&ev)
		f.n++
		id := fmt.Sprintf("g%d", f.n)
		ev["id"], ev["etag"] = id, fmt.Sprintf("e%d", f.n)
		f.events[id] = ev
		write(ev)
	case strings.HasPrefix(p, "/calendars/app-cal/events/"):
		id := strings.TrimPrefix(p, "/calendars/app-cal/events/")
		ev, ok := f.events[id]
		switch r.Method {
		case http.MethodGet:
			if !ok {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			write(ev)
		case http.MethodPut:
			var nv map[string]any
			b, _ := io.ReadAll(r.Body)
			_ = json.Unmarshal(b, &nv)
			nv["id"], nv["etag"] = id, "e-act"
			f.events[id] = nv
			write(nv)
		case http.MethodDelete:
			delete(f.events, id)
			w.WriteHeader(http.StatusNoContent)
		}
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func (f *fakeGoogle) only() map[string]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, e := range f.events {
		return e
	}
	return nil
}

func TestSincronizacionConGoogle(t *testing.T) {
	f := setup(t, 1)
	fg := &fakeGoogle{events: map[string]map[string]any{}}
	srv := httptest.NewServer(fg)
	t.Cleanup(srv.Close)
	sealer, err := extsync.NewSealer(strings.Repeat("k", 40))
	if err != nil {
		t.Fatal(err)
	}
	sy := &extsync.Syncer{Store: f.e.Store, Sealer: sealer, Clock: f.clk, Log: slog.New(slog.DiscardHandler), Cfg: config.SyncConfig{
		GoogleAPIURL: srv.URL, GoogleTokenURL: srv.URL + "/token", GoogleClientID: "id", GoogleClientSecret: "secreto",
		GoogleChannelSecret: "canal", HooksURL: "https://hooks.example.com",
	}}
	f.e.Sync = sy
	syncSrv := engine.SyncServer{Engine: f.e}

	// Ocupado externo el martes 15 de 10:00 a 11:00 (CDMX).
	fg.busy = []map[string]string{{"start": f.at(9, 15, 10, 0).AsTime().Format(time.RFC3339), "end": f.at(9, 15, 11, 0).AsTime().Format(time.RFC3339)}}
	creds, _ := json.Marshal(extsync.Credentials{AccessToken: "viejo", RefreshToken: "r", Expiry: time.Now().Add(-time.Hour)})
	conn, err := syncSrv.UpsertConnection(f.owner, &calendarv1.UpsertConnectionRequest{CalendarId: f.cal, Provider: "google", Account: "ana@example.com", Credentials: creds})
	if err != nil {
		t.Fatal(err)
	}
	if conn.GetStatus() != "active" || len(conn.GetCalendars()) != 2 || fg.refresh == 0 {
		t.Fatalf("conexión: %+v (refrescos %d)", conn, fg.refresh)
	}

	// El ocupado externo bloquea esos horarios.
	slots, err := engine.AvailabilityServer{Engine: f.e}.GetSlots(f.owner, &calendarv1.GetSlotsRequest{CalendarId: f.cal, ServiceId: f.svc, From: f.at(9, 15, 9, 0), To: f.at(9, 15, 12, 0)})
	if err != nil {
		t.Fatal(err)
	}
	var horas []string
	for _, s := range slots.GetSlots() {
		horas = append(horas, s.GetStart().AsTime().In(f.mx).Format("15:04"))
	}
	if strings.Join(horas, ",") != "09:00,09:30,11:00,11:30" {
		t.Fatalf("huecos con ocupado externo: %v", horas)
	}

	// Una cita nuestra se escribe en el calendario de la app.
	res, err := f.ev.CreateEvent(f.owner, &calendarv1.CreateEventRequest{CalendarId: f.cal, ServiceId: f.svc, Start: f.at(9, 16, 10, 0), Attendee: &calendarv1.Attendee{Name: "Ana"}})
	if err != nil {
		t.Fatal(err)
	}
	if err := sy.Push(context.Background(), f.cal, res.GetEvent().GetId()); err != nil {
		t.Fatal(err)
	}
	g := fg.only()
	if g == nil || !strings.Contains(fmt.Sprint(g["summary"]), "Ana") {
		t.Fatalf("evento en Google: %v", g)
	}

	// Alguien lo mueve en Google: la reconciliación lo restaura (nuestro sistema manda).
	fg.mu.Lock()
	for _, e := range fg.events {
		e["start"] = map[string]string{"dateTime": f.at(9, 16, 13, 0).AsTime().Format(time.RFC3339)}
		e["end"] = map[string]string{"dateTime": f.at(9, 16, 13, 30).AsTime().Format(time.RFC3339)}
	}
	fg.mu.Unlock()
	if err := sy.Reconcile(context.Background(), conn.GetId()); err != nil {
		t.Fatal(err)
	}
	g = fg.only()
	if start := g["start"].(map[string]any)["dateTime"]; start != f.at(9, 16, 10, 0).AsTime().Format(time.RFC3339) {
		t.Fatalf("no se restauró: %v", start)
	}

	// Y si lo borran, se vuelve a crear.
	fg.mu.Lock()
	fg.events = map[string]map[string]any{}
	fg.mu.Unlock()
	if err := sy.Reconcile(context.Background(), conn.GetId()); err != nil || fg.only() == nil {
		t.Fatalf("no se recreó: %v", err)
	}

	// Cancelar la cita la borra de Google.
	if _, err := f.ev.CancelEvent(f.owner, &calendarv1.CancelEventRequest{Id: res.GetEvent().GetId()}); err != nil {
		t.Fatal(err)
	}
	if err := sy.Push(context.Background(), f.cal, res.GetEvent().GetId()); err != nil || fg.only() != nil {
		t.Fatalf("no se borró: %v %v", err, fg.only())
	}

	// Feeds: completo, «ocupado», ETag y revocación.
	block, err := f.ev.CreateEvent(f.owner, &calendarv1.CreateEventRequest{CalendarId: f.cal, ServiceId: f.svc, Start: f.at(9, 17, 10, 0), Attendee: &calendarv1.Attendee{Name: "Bruno"}})
	if err != nil || block == nil {
		t.Fatal(err)
	}
	full, err := syncSrv.CreateFeed(f.owner, &calendarv1.CreateFeedRequest{CalendarId: f.cal, Scope: "full", Locale: "es"})
	if err != nil {
		t.Fatal(err)
	}
	busy, err := syncSrv.CreateFeed(f.owner, &calendarv1.CreateFeedRequest{CalendarId: f.cal, Scope: "busy", Locale: "es"})
	if err != nil {
		t.Fatal(err)
	}
	h := sy.Handler()
	get := func(token, etag string) *httptest.ResponseRecorder {
		r := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/ics/"+token+".ics", nil)
		if etag != "" {
			r.Header.Set("If-None-Match", etag)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	w := get(full.GetToken(), "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), "Bruno") || !strings.Contains(w.Body.String(), "REFRESH-INTERVAL") {
		t.Fatalf("feed completo: %d %s", w.Code, w.Body)
	}
	if w2 := get(full.GetToken(), w.Header().Get("ETag")); w2.Code != http.StatusNotModified {
		t.Fatalf("ETag: %d", w2.Code)
	}
	if b := get(busy.GetToken(), "").Body.String(); strings.Contains(b, "Bruno") || !strings.Contains(b, "SUMMARY:Ocupado") {
		t.Fatalf("feed ocupado: %s", b)
	}
	if _, err := syncSrv.RevokeFeed(f.owner, &calendarv1.RevokeFeedRequest{Id: full.GetFeed().GetId()}); err != nil {
		t.Fatal(err)
	}
	if get(full.GetToken(), "").Code != http.StatusNotFound {
		t.Fatal("feed revocado sigue respondiendo")
	}

	// Credencial revocada: la conexión queda «revoked» y deja de sincronizar.
	fg.mu.Lock()
	fg.revoked = true
	fg.mu.Unlock()
	_ = sy.Reconcile(context.Background(), conn.GetId())
	got, err := store.GetConnection(context.Background(), f.e.Store.Pool, conn.GetId())
	if err != nil || got.Status != "revoked" {
		t.Fatalf("revocada: %+v %v", got.Status, err)
	}
	// Un aviso con firma incorrecta se rechaza.
	r := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/hooks/google", nil)
	r.Header.Set("X-Goog-Channel-ID", "x")
	r.Header.Set("X-Goog-Channel-Token", "malo")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("aviso sin firma: %d", rec.Code)
	}
}
