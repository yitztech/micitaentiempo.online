package engine

import (
	"context"
	"slices"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5"
	calendarv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/calendar/v1"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/store"
)

var allowedSteps = []int{5, 10, 15, 20, 30, 45, 60, 90, 120}

// ServiceCatalogServer implementa mcet.calendar.v1.ServiceCatalogService.
type ServiceCatalogServer struct{ *Engine }

func toProtoService(s store.Service) *calendarv1.Service {
	return &calendarv1.Service{
		Id: s.ID, CalendarId: s.CalendarID, Name: s.Name, Description: s.Description,
		DurationMin: int32(s.DurationMin), BufferBeforeMin: int32(s.BufferBeforeMin), BufferAfterMin: int32(s.BufferAfterMin), //nolint:gosec // acotados por CHECK
		MinNoticeMin: int32(s.MinNoticeMin), MaxAdvanceDays: int32(s.MaxAdvanceDays), SlotStepMin: int32(s.SlotStepMin), //nolint:gosec // acotados
		DailyLimit: int32(s.DailyLimit), Color: s.Color, Active: s.Active, Position: int32(s.Position), //nolint:gosec // acotados
	}
}

func fromProtoService(p *calendarv1.Service) (store.Service, error) {
	s := store.Service{
		ID: p.GetId(), CalendarID: p.GetCalendarId(), Name: p.GetName(), Description: p.GetDescription(),
		DurationMin: int(p.GetDurationMin()), BufferBeforeMin: int(p.GetBufferBeforeMin()), BufferAfterMin: int(p.GetBufferAfterMin()),
		MinNoticeMin: int(p.GetMinNoticeMin()), MaxAdvanceDays: int(p.GetMaxAdvanceDays()), SlotStepMin: int(p.GetSlotStepMin()),
		DailyLimit: int(p.GetDailyLimit()), Color: p.GetColor(), Active: p.GetActive(),
	}
	for lang, value := range s.Name {
		if (lang != "es" && lang != "en") || !validText(value, 120, false) {
			return s, fail(connect.CodeInvalidArgument, "validation_failed", "nombre no válido")
		}
	}
	for lang, value := range s.Description {
		if (lang != "es" && lang != "en") || !validText(value, 1000, true) {
			return s, fail(connect.CodeInvalidArgument, "validation_failed", "descripción no válida")
		}
	}
	if !validName(s.Name["es"]) && !validName(s.Name["en"]) {
		return s, fail(connect.CodeInvalidArgument, "invalid_name", "el servicio necesita nombre en es o en")
	}
	if s.DurationMin < 5 || s.DurationMin > 720 {
		return s, fail(connect.CodeInvalidArgument, "invalid_duration", "5 a 720 minutos")
	}
	if s.SlotStepMin == 0 {
		s.SlotStepMin = 30
	}
	if !slices.Contains(allowedSteps, s.SlotStepMin) {
		return s, fail(connect.CodeInvalidArgument, "invalid_step", "%d", s.SlotStepMin)
	}
	if s.MaxAdvanceDays == 0 {
		s.MaxAdvanceDays = 60
	}
	if s.BufferBeforeMin < 0 || s.BufferBeforeMin > 240 || s.BufferAfterMin < 0 || s.BufferAfterMin > 240 ||
		s.MinNoticeMin < 0 || s.MinNoticeMin > 43200 || s.MaxAdvanceDays < 1 || s.MaxAdvanceDays > 365 || s.DailyLimit < 0 {
		return s, fail(connect.CodeInvalidArgument, "invalid_service", "valores fuera de rango")
	}
	if s.Color == "" {
		s.Color = "laguna"
	}
	return s, nil
}

// ListServices devuelve los servicios (los inactivos solo al personal).
func (s ServiceCatalogServer) ListServices(ctx context.Context, req *calendarv1.ListServicesRequest) (*calendarv1.ListServicesResponse, error) {
	_, a, err := s.calendar(ctx, req.GetCalendarId(), false)
	if err != nil {
		return nil, err
	}
	includeInactive := req.GetIncludeInactive() && a.Role != "customer"
	svcs, err := s.Store.ListServices(ctx, req.GetCalendarId(), includeInactive)
	if err != nil {
		return nil, err
	}
	out := &calendarv1.ListServicesResponse{}
	for _, sv := range svcs {
		out.Services = append(out.Services, toProtoService(sv))
	}
	return out, nil
}

// CreateService crea un tipo de cita.
func (s ServiceCatalogServer) CreateService(ctx context.Context, req *calendarv1.CreateServiceRequest) (*calendarv1.Service, error) {
	in := req.GetService()
	if _, _, err := s.calendar(ctx, in.GetCalendarId(), true); err != nil {
		return nil, err
	}
	sv, err := fromProtoService(in)
	if err != nil {
		return nil, err
	}
	sv.Active = true
	var created store.Service
	err = s.Store.InTx(ctx, func(tx pgx.Tx) error {
		var err error
		created, err = s.Store.CreateServiceTx(ctx, tx, sv)
		if err != nil {
			return err
		}
		if _, err := s.Store.IncrementCalendarVersionTx(ctx, tx, in.GetCalendarId()); err != nil {
			return err
		}
		snap, err := s.Store.GetCalendarSnapshotTx(ctx, tx, in.GetCalendarId())
		if err != nil {
			return err
		}
		a, _ := actorOf(ctx)
		return s.emitCalendarSnapshot(ctx, tx, snap, a)
	})
	if err != nil {
		return nil, storeErr(err)
	}
	return toProtoService(created), nil
}

// UpdateService cambia un tipo de cita.
func (s ServiceCatalogServer) UpdateService(ctx context.Context, req *calendarv1.UpdateServiceRequest) (*calendarv1.Service, error) {
	in := req.GetService()
	if _, _, err := s.calendar(ctx, in.GetCalendarId(), true); err != nil {
		return nil, err
	}
	sv, err := fromProtoService(in)
	if err != nil {
		return nil, err
	}
	var updated store.Service
	err = s.Store.InTx(ctx, func(tx pgx.Tx) error {
		var err error
		updated, err = s.Store.UpdateServiceTx(ctx, tx, sv)
		if err != nil {
			return err
		}
		if _, err := s.Store.IncrementCalendarVersionTx(ctx, tx, in.GetCalendarId()); err != nil {
			return err
		}
		snap, err := s.Store.GetCalendarSnapshotTx(ctx, tx, in.GetCalendarId())
		if err != nil {
			return err
		}
		a, _ := actorOf(ctx)
		return s.emitCalendarSnapshot(ctx, tx, snap, a)
	})
	if err != nil {
		return nil, storeErr(err)
	}
	return toProtoService(updated), nil
}

// DeleteService borra un tipo de cita.
func (s ServiceCatalogServer) DeleteService(ctx context.Context, req *calendarv1.DeleteServiceRequest) (*calendarv1.DeleteServiceResponse, error) {
	if _, _, err := s.calendar(ctx, req.GetCalendarId(), true); err != nil {
		return nil, err
	}
	err := s.Store.InTx(ctx, func(tx pgx.Tx) error {
		if err := s.Store.DeleteServiceTx(ctx, tx, req.GetCalendarId(), req.GetId()); err != nil {
			return err
		}
		if _, err := s.Store.IncrementCalendarVersionTx(ctx, tx, req.GetCalendarId()); err != nil {
			return err
		}
		snap, err := s.Store.GetCalendarSnapshotTx(ctx, tx, req.GetCalendarId())
		if err != nil {
			return err
		}
		a, _ := actorOf(ctx)
		return s.emitCalendarSnapshot(ctx, tx, snap, a)
	})
	if err != nil {
		return nil, storeErr(err)
	}
	return &calendarv1.DeleteServiceResponse{}, nil
}

// ReorderServices fija el orden de los servicios.
func (s ServiceCatalogServer) ReorderServices(ctx context.Context, req *calendarv1.ReorderServicesRequest) (*calendarv1.ListServicesResponse, error) {
	if _, _, err := s.calendar(ctx, req.GetCalendarId(), true); err != nil {
		return nil, err
	}
	err := s.Store.InTx(ctx, func(tx pgx.Tx) error {
		if err := s.Store.ReorderServicesTx(ctx, tx, req.GetCalendarId(), req.GetIds()); err != nil {
			return err
		}
		if _, err := s.Store.IncrementCalendarVersionTx(ctx, tx, req.GetCalendarId()); err != nil {
			return err
		}
		snap, err := s.Store.GetCalendarSnapshotTx(ctx, tx, req.GetCalendarId())
		if err != nil {
			return err
		}
		a, _ := actorOf(ctx)
		return s.emitCalendarSnapshot(ctx, tx, snap, a)
	})
	if err != nil {
		return nil, storeErr(err)
	}
	return s.ListServices(ctx, &calendarv1.ListServicesRequest{CalendarId: req.GetCalendarId(), IncludeInactive: true})
}
