// Package clock da la hora al motor. En producción es el reloj real; con TEST_MODE
// las pruebas por escenarios pueden fijar «ahora» (docs/plan/09-pruebas.md §9.2).
package clock

import (
	"sync"
	"time"
)

// Clock devuelve el instante actual.
type Clock interface {
	Now() time.Time
}

// Real usa la hora del sistema, siempre en UTC.
type Real struct{}

// Now devuelve la hora actual en UTC.
func (Real) Now() time.Time { return time.Now().UTC() }

// Settable es un reloj que avanza con el tiempo real desde un instante fijado.
type Settable struct {
	mu     sync.RWMutex
	offset time.Duration
}

// Now devuelve la hora real desplazada.
func (s *Settable) Now() time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return time.Now().UTC().Add(s.offset)
}

// Set fija «ahora»; el reloj sigue avanzando desde ahí. El instante cero vuelve al reloj real.
func (s *Settable) Set(now time.Time) time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()
	if now.IsZero() {
		s.offset = 0
	} else {
		s.offset = time.Until(now)
	}
	return time.Now().UTC().Add(s.offset)
}
