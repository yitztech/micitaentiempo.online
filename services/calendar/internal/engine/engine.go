// Package engine implementa los servicios Connect del motor sobre store, availability y holidays.
package engine

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/auth"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/clock"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/extsync"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/holidays"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/store"
)

// Engine agrupa las dependencias de los servicios.
type Engine struct {
	Store    *store.Store
	Holidays *holidays.Catalog
	Clock    clock.Clock
	// Occupancy aporta citas y bloqueos al cálculo de huecos; nil = sin ocupación.
	Occupancy Occupancy
	// Jobs encola eventos de dominio en la misma transacción (outbox); nil = no se emiten.
	Jobs *river.Client[pgx.Tx]
	// Sync aporta el ocupado externo y escribe nuestros eventos fuera; nil = sin sincronización.
	Sync *extsync.Syncer
}

// fail crea un error Connect con un motivo estable ("motivo: detalle") que api traduce a problem+json.
func fail(code connect.Code, reason, format string, args ...any) error {
	return connect.NewError(code, fmt.Errorf("%s: %s", reason, fmt.Sprintf(format, args...)))
}

func actorOf(ctx context.Context) (auth.ActorClaims, error) {
	v, ok := auth.FromContext(ctx)
	if !ok {
		return auth.ActorClaims{}, fail(connect.CodeUnauthenticated, "unauthenticated", "sin actor")
	}
	return v.Actor, nil
}

// requireOrg exige que el actor pertenezca a la organización con uno de los roles dados.
func requireOrg(a auth.ActorClaims, orgID string, roles ...string) error {
	if a.Role == "system" {
		return nil
	}
	if a.OrgID == "" || a.OrgID != orgID {
		return fail(connect.CodePermissionDenied, "permission_denied", "organización ajena")
	}
	if len(roles) > 0 && !slices.Contains(roles, a.Role) {
		return fail(connect.CodePermissionDenied, "permission_denied", "rol %q sin permiso", a.Role)
	}
	return nil
}

// calendar carga un tablero; con write exige ser propietario de su organización.
func (e *Engine) calendar(ctx context.Context, id string, write bool) (store.Calendar, auth.ActorClaims, error) {
	a, err := actorOf(ctx)
	if err != nil {
		return store.Calendar{}, a, err
	}
	c, err := e.Store.GetCalendar(ctx, id)
	if errors.Is(err, store.ErrNotFound) {
		return c, a, fail(connect.CodeNotFound, "calendar_not_found", "tablero %s", id)
	}
	if err != nil {
		return c, a, err
	}
	if write {
		if err := requireOrg(a, c.OrgID, "owner"); err != nil {
			return c, a, err
		}
		if c.OrgStatus == "read_only" || c.OrgStatus == "suspended" {
			return c, a, fail(connect.CodeFailedPrecondition, "org_read_only", "organización en solo lectura")
		}
	}
	return c, a, nil
}

func location(tz string) (*time.Location, error) {
	if tz == "" || tz == "Local" {
		return nil, fail(connect.CodeInvalidArgument, "invalid_timezone", "zona horaria vacía")
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return nil, fail(connect.CodeInvalidArgument, "invalid_timezone", "%q", tz)
	}
	return loc, nil
}

func storeErr(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, store.ErrNotFound):
		return fail(connect.CodeNotFound, "not_found", "%v", err)
	case errors.Is(err, store.ErrConflict):
		return fail(connect.CodeAlreadyExists, "conflict", "%v", err)
	default:
		return err
	}
}
