// Package httpapi expone los endpoints HTTP del motor: públicos (vía gateway) e internos.
package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

// Pinger comprueba la base de datos.
type Pinger interface {
	Ping(ctx context.Context) error
}

// PublicMux atiende el puerto que enruta el gateway (/hooks, /ics) y /healthz.
func PublicMux(revision string) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "revision": revision})
	})
	return mux
}

// InternalMux atiende el puerto interno (RPC, /readyz, /metrics); el gateway no lo enruta.
func InternalMux(db Pinger) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := db.Ping(ctx); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})
	return mux
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// NewServer crea un servidor con tiempos máximos razonables.
func NewServer(addr string, h http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           h,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
}
