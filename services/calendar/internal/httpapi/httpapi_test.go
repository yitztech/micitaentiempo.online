package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeDB struct{ err error }

func (f fakeDB) Ping(context.Context) error { return f.err }

func TestHealthzDevuelveRevision(t *testing.T) {
	rec := httptest.NewRecorder()
	PublicMux("abc").ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/healthz", nil))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"revision":"abc"`) {
		t.Fatalf("respuesta inesperada: %d %s", rec.Code, rec.Body)
	}
}

func TestReadyzSegunBaseDeDatos(t *testing.T) {
	for _, tc := range []struct {
		err  error
		want int
	}{{nil, http.StatusOK}, {errors.New("caída"), http.StatusServiceUnavailable}} {
		rec := httptest.NewRecorder()
		InternalMux(fakeDB{tc.err}).ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/readyz", nil))
		if rec.Code != tc.want {
			t.Fatalf("readyz con err=%v: %d, se esperaba %d", tc.err, rec.Code, tc.want)
		}
	}
}

func TestPublicMuxNoExponeReadyz(t *testing.T) {
	rec := httptest.NewRecorder()
	PublicMux("x").ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/readyz", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("readyz no debe estar en el puerto público: %d", rec.Code)
	}
}
