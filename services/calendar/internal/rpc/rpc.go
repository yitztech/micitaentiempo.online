// Package rpc expone los servicios Connect del motor en el puerto interno.
package rpc

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"connectrpc.com/connect"
	calendarv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/calendar/v1"
	"github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/calendar/v1/calendarv1connect"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/auth"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/clock"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/engine"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// AuthInterceptor exige el JWT interno de api y deja el actor en el contexto.
func AuthInterceptor(v *auth.Verifier) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			raw, ok := strings.CutPrefix(req.Header().Get("Authorization"), "Bearer ")
			if !ok || raw == "" {
				return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("falta el token interno"))
			}
			verified, err := v.Verify(raw)
			if err != nil {
				return nil, connect.NewError(connect.CodeUnauthenticated, err)
			}
			if verified.RequestID == "" {
				verified.RequestID = req.Header().Get("X-Request-Id")
			}
			return next(auth.WithActor(ctx, verified), req)
		}
	}
}

// ActorFrom devuelve el actor verificado o un error Connect.
func ActorFrom(ctx context.Context) (auth.Verified, error) {
	v, ok := auth.FromContext(ctx)
	if !ok {
		return auth.Verified{}, connect.NewError(connect.CodeUnauthenticated, errors.New("sin actor"))
	}
	return v, nil
}

// SystemServer implementa mcet.calendar.v1.SystemService.
type SystemServer struct {
	Revision string
}

// Ping devuelve la revisión y el actor tal y como lo ve el motor.
func (s SystemServer) Ping(ctx context.Context, _ *calendarv1.PingRequest) (*calendarv1.PingResponse, error) {
	v, err := ActorFrom(ctx)
	if err != nil {
		return nil, err
	}
	return &calendarv1.PingResponse{Revision: s.Revision, Actor: v.Actor.ToProto()}, nil
}

// TestingServer implementa mcet.calendar.v1.TestingService (solo con TEST_MODE).
type TestingServer struct {
	Clock *clock.Settable
}

// SetClock fija «ahora» para las pruebas por escenarios; sin instante, vuelve al reloj real.
func (s TestingServer) SetClock(_ context.Context, req *calendarv1.SetClockRequest) (*calendarv1.SetClockResponse, error) {
	var target time.Time
	if req.GetNow() != nil {
		target = req.GetNow().AsTime()
	}
	return &calendarv1.SetClockResponse{Now: timestamppb.New(s.Clock.Set(target))}, nil
}

// Options agrupa lo necesario para montar los servicios.
type Options struct {
	Revision string
	Verifier *auth.Verifier
	// TestClock solo se pasa con TEST_MODE.
	TestClock *clock.Settable
	// Engine implementa los servicios de dominio (nil en pruebas de transporte).
	Engine *engine.Engine
}

// Mount registra los servicios Connect en el mux interno.
func Mount(mux *http.ServeMux, o Options) {
	interceptors := connect.WithInterceptors(AuthInterceptor(o.Verifier))
	mux.Handle(calendarv1connect.NewSystemServiceHandler(SystemServer{Revision: o.Revision}, interceptors))
	if o.TestClock != nil {
		mux.Handle(calendarv1connect.NewTestingServiceHandler(TestingServer{Clock: o.TestClock}, interceptors))
	}
	if e := o.Engine; e != nil {
		mux.Handle(calendarv1connect.NewCalendarServiceHandler(engine.CalendarServer{Engine: e}, interceptors))
		mux.Handle(calendarv1connect.NewScheduleServiceHandler(engine.ScheduleServer{Engine: e}, interceptors))
		mux.Handle(calendarv1connect.NewServiceCatalogServiceHandler(engine.ServiceCatalogServer{Engine: e}, interceptors))
		mux.Handle(calendarv1connect.NewAvailabilityServiceHandler(engine.AvailabilityServer{Engine: e}, interceptors))
		mux.Handle(calendarv1connect.NewEventServiceHandler(engine.EventServer{Engine: e}, interceptors))
		mux.Handle(calendarv1connect.NewStatsServiceHandler(engine.StatsServer{Engine: e}, interceptors))
		mux.Handle(calendarv1connect.NewSyncServiceHandler(engine.SyncServer{Engine: e}, interceptors))
	}
}
