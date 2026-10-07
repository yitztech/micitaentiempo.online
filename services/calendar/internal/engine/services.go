package engine

import (
	"context"
	"slices"

	"connectrpc.com/connect"
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
	if s.Name["es"] == "" && s.Name["en"] == "" {
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
	created, err := s.Store.CreateService(ctx, sv)
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
	updated, err := s.Store.UpdateService(ctx, sv)
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
	return &calendarv1.DeleteServiceResponse{}, storeErr(s.Store.DeleteService(ctx, req.GetCalendarId(), req.GetId()))
}

// ReorderServices fija el orden de los servicios.
func (s ServiceCatalogServer) ReorderServices(ctx context.Context, req *calendarv1.ReorderServicesRequest) (*calendarv1.ListServicesResponse, error) {
	if _, _, err := s.calendar(ctx, req.GetCalendarId(), true); err != nil {
		return nil, err
	}
	if err := s.Store.ReorderServices(ctx, req.GetCalendarId(), req.GetIds()); err != nil {
		return nil, err
	}
	return s.ListServices(ctx, &calendarv1.ListServicesRequest{CalendarId: req.GetCalendarId(), IncludeInactive: true})
}
