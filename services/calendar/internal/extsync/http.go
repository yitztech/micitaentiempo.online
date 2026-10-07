package extsync

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	ics "github.com/arran4/golang-ical"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/store"
)

// Ventana de los feeds: del día −30 al +365.
const (
	feedPast   = 30 * 24 * time.Hour
	feedFuture = 365 * 24 * time.Hour
)

var busyText = map[string]string{"es": "Ocupado", "en": "Busy"}

// Handler sirve los feeds ICS y recibe los avisos de Google y Microsoft (puerto público, vía gateway).
func (s *Syncer) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /ics/{file}", s.serveFeed)
	mux.HandleFunc("POST /hooks/google", s.googleHook)
	mux.HandleFunc("POST /hooks/microsoft", s.microsoftHook)
	return mux
}

func (s *Syncer) serveFeed(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSuffix(r.PathValue("file"), ".ics")
	if len(token) != 64 {
		http.NotFound(w, r)
		return
	}
	feed, err := store.FeedByToken(r.Context(), s.Store.Pool, HashToken(token))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	body, err := s.renderFeed(r.Context(), feed)
	if err != nil {
		s.Log.Error("feed", "err", err)
		http.Error(w, "error", http.StatusInternalServerError)
		return
	}
	sum := sha256.Sum256(body)
	etag := `"` + hex.EncodeToString(sum[:16]) + `"`
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "private, max-age=300")
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", `inline; filename="calendario.ics"`)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(body) //nolint:gosec // iCalendar propio con Content-Type text/calendar, no HTML
}

// renderFeed genera el iCalendar del feed: tablero completo, solo «ocupado», o citas del cliente final.
func (s *Syncer) renderFeed(ctx context.Context, f store.Feed) ([]byte, error) {
	now := s.Clock.Now()
	from, to := now.Add(-feedPast), now.Add(feedFuture)
	cal := ics.NewCalendar()
	cal.SetMethod(ics.MethodPublish)
	cal.SetProductId("-//Mi Cita en Tiempo//" + f.Locale)
	cal.SetXPublishedTTL("PT15M")
	cal.SetRefreshInterval("PT15M")
	var events []store.Event
	names := map[string]string{} // tablero → nombre
	addresses := map[string]string{}
	var err error
	if f.Scope == "personal" {
		events, err = store.OrgEventsOfCustomer(ctx, s.Store.Pool, f.OrgID, f.CustomerUserID, from, to)
	} else {
		var c store.Calendar
		c, err = s.Store.GetCalendar(ctx, f.CalendarID)
		if err == nil {
			cal.SetName(c.Name)
			cal.SetTimezoneId(c.Timezone)
			events, err = store.ListEvents(ctx, s.Store.Pool, c.ID, from, to, "", false)
		}
	}
	if err != nil {
		return nil, err
	}
	services := map[string]string{}
	for _, ev := range events {
		if ev.Status != "confirmed" {
			continue
		}
		if _, ok := names[ev.CalendarID]; !ok {
			if c, err := s.Store.GetCalendar(ctx, ev.CalendarID); err == nil {
				names[c.ID], addresses[c.ID] = c.Name, c.Address
				if svcs, err := s.Store.ListServices(ctx, c.ID, true); err == nil {
					for _, sv := range svcs {
						n := sv.Name[f.Locale]
						if n == "" {
							for _, x := range sv.Name {
								n = x
								break
							}
						}
						services[sv.ID] = n
					}
				}
			}
		}
		v := cal.AddEvent(ev.ICalUID)
		v.SetDtStampTime(ev.CreatedAt)
		v.SetStartAt(ev.Start)
		v.SetEndAt(ev.End)
		v.SetSequence(ev.ICalSequence)
		switch f.Scope {
		case "busy":
			v.SetSummary(busyText[f.Locale])
		case "personal":
			v.SetSummary(strings.TrimPrefix(services[ev.ServiceID]+" · "+names[ev.CalendarID], " · "))
			if a := addresses[ev.CalendarID]; a != "" {
				v.SetLocation(a)
			}
		default:
			parts := []string{}
			for _, p := range []string{ev.Title, ev.Attendee.Name, services[ev.ServiceID]} {
				if p != "" {
					parts = append(parts, p)
				}
			}
			if len(parts) == 0 {
				parts = append(parts, busyText[f.Locale])
			}
			v.SetSummary(strings.Join(parts, " · "))
			if ev.InternalNotes != "" {
				v.SetDescription(ev.InternalNotes)
			}
		}
	}
	return []byte(cal.Serialize()), nil
}

// googleHook: aviso de canal; se valida X-Goog-Channel-Token y se encola la reconciliación.
func (s *Syncer) googleHook(w http.ResponseWriter, r *http.Request) {
	channel := r.Header.Get("X-Goog-Channel-ID")
	token := r.Header.Get("X-Goog-Channel-Token")
	if channel == "" || subtle.ConstantTimeCompare([]byte(token), []byte(ChannelToken(s.Cfg.GoogleChannelSecret, channel))) != 1 {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	if r.Header.Get("X-Goog-Resource-State") != "sync" {
		if conn, _, err := store.ConnectionByChannel(r.Context(), s.Store.Pool, channel); err == nil {
			_ = s.EnqueueReconcile(r.Context(), conn)
		}
	}
	w.WriteHeader(http.StatusOK)
}

// microsoftHook: valida la suscripción (validationToken) y el clientState de cada aviso.
func (s *Syncer) microsoftHook(w http.ResponseWriter, r *http.Request) {
	if v := r.URL.Query().Get("validationToken"); v != "" {
		w.Header().Set("Content-Type", "text/plain")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		_, _ = io.WriteString(w, v) //nolint:gosec // Graph exige devolver el validationToken tal cual, en text/plain
		return
	}
	var body struct {
		Value []struct {
			SubscriptionID string `json:"subscriptionId"`
			ClientState    string `json:"clientState"`
		} `json:"value"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	for _, n := range body.Value {
		conn, ext, err := store.ConnectionByChannel(r.Context(), s.Store.Pool, n.SubscriptionID)
		if err != nil {
			if !errors.Is(err, store.ErrNotFound) {
				s.Log.Warn("aviso de Microsoft", "err", err)
			}
			continue
		}
		if subtle.ConstantTimeCompare([]byte(n.ClientState), []byte(ChannelToken(s.Cfg.MSClientState, ext))) != 1 {
			continue
		}
		_ = s.EnqueueReconcile(r.Context(), conn)
	}
	w.WriteHeader(http.StatusAccepted)
}
