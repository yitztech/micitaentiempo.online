package engine

import (
	"context"
	"regexp"

	"connectrpc.com/connect"
	calendarv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/calendar/v1"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/store"
	"google.golang.org/protobuf/types/known/timestamppb"
)

var (
	slugRe   = regexp.MustCompile(`^[a-z0-9](-?[a-z0-9])*$`)
	statuses = map[string]bool{"trialing": true, "active": true, "past_due": true, "read_only": true, "suspended": true}
)

// CalendarServer implementa mcet.calendar.v1.CalendarService.
type CalendarServer struct{ *Engine }

func toProtoCalendar(c store.Calendar) *calendarv1.Calendar {
	return &calendarv1.Calendar{
		Id: c.ID, OrgId: c.OrgID, Slug: c.Slug, Name: c.Name, Timezone: c.Timezone, Capacity: int32(c.Capacity), //nolint:gosec // 1…50
		Country: c.Country, Subdivision: c.Subdivision, Address: c.Address,
		EmbedPolicy:   &calendarv1.EmbedPolicy{Mode: c.EmbedPolicy.Mode, Origins: c.EmbedPolicy.Origins},
		BookingPolicy: &calendarv1.BookingPolicy{CancelMinNoticeMinutes: int32(c.BookingPolicy.CancelMinNoticeMinutes)}, //nolint:gosec // acotado
		Status:        c.Status, CreatedAt: timestamppb.New(c.CreatedAt), OrgStatus: c.OrgStatus,
	}
}

func (s CalendarServer) validatePlace(country, subdivision string) error {
	if country == "" {
		if subdivision != "" {
			return fail(connect.CodeInvalidArgument, "invalid_subdivision", "región sin país")
		}
		return nil
	}
	if !s.Holidays.HasCountry(country, subdivision) {
		return fail(connect.CodeInvalidArgument, "invalid_country", "%s %s", country, subdivision)
	}
	return nil
}

// CreateCalendar da de alta un tablero (el límite del plan lo comprueba api).
func (s CalendarServer) CreateCalendar(ctx context.Context, req *calendarv1.CreateCalendarRequest) (*calendarv1.Calendar, error) {
	a, err := actorOf(ctx)
	if err != nil {
		return nil, err
	}
	if err := requireOrg(a, req.GetOrgId(), "owner"); err != nil {
		return nil, err
	}
	if !statuses[req.GetOrgStatus()] {
		return nil, fail(connect.CodeInvalidArgument, "invalid_status", "%q", req.GetOrgStatus())
	}
	if l := len([]rune(req.GetName())); l < 1 || l > 120 {
		return nil, fail(connect.CodeInvalidArgument, "invalid_name", "nombre de 1 a 120 caracteres")
	}
	if _, err := location(req.GetTimezone()); err != nil {
		return nil, err
	}
	if req.GetSlug() != "" && (!slugRe.MatchString(req.GetSlug()) || len(req.GetSlug()) < 3 || len(req.GetSlug()) > 60) {
		return nil, fail(connect.CodeInvalidArgument, "invalid_slug", "%q", req.GetSlug())
	}
	capacity := int(req.GetCapacity())
	if capacity == 0 {
		capacity = 1
	}
	if capacity < 1 || capacity > 50 {
		return nil, fail(connect.CodeInvalidArgument, "invalid_capacity", "1 a 50")
	}
	if err := s.validatePlace(req.GetCountry(), req.GetSubdivision()); err != nil {
		return nil, err
	}
	c, err := s.Store.CreateCalendar(ctx, store.NewCalendar{
		OrgID: req.GetOrgId(), OrgStatus: req.GetOrgStatus(), Name: req.GetName(), Slug: req.GetSlug(),
		Timezone: req.GetTimezone(), Capacity: capacity, Country: req.GetCountry(), Subdivision: req.GetSubdivision(),
		Address: req.GetAddress(),
	})
	if err != nil {
		return nil, storeErr(err)
	}
	return toProtoCalendar(c), nil
}

// GetCalendar devuelve un tablero (datos públicos).
func (s CalendarServer) GetCalendar(ctx context.Context, req *calendarv1.GetCalendarRequest) (*calendarv1.Calendar, error) {
	c, _, err := s.calendar(ctx, req.GetId(), false)
	if err != nil {
		return nil, err
	}
	return toProtoCalendar(c), nil
}

// GetCalendarBySlug resuelve la URL pública.
func (s CalendarServer) GetCalendarBySlug(ctx context.Context, req *calendarv1.GetCalendarBySlugRequest) (*calendarv1.Calendar, error) {
	if _, err := actorOf(ctx); err != nil {
		return nil, err
	}
	c, err := s.Store.GetCalendarBySlug(ctx, req.GetSlug())
	if err != nil {
		return nil, storeErr(err)
	}
	return toProtoCalendar(c), nil
}

// ListCalendars devuelve los tableros de la organización del actor.
func (s CalendarServer) ListCalendars(ctx context.Context, req *calendarv1.ListCalendarsRequest) (*calendarv1.ListCalendarsResponse, error) {
	a, err := actorOf(ctx)
	if err != nil {
		return nil, err
	}
	if err := requireOrg(a, req.GetOrgId()); err != nil {
		return nil, err
	}
	cs, err := s.Store.ListCalendars(ctx, req.GetOrgId(), req.GetIncludeArchived())
	if err != nil {
		return nil, err
	}
	out := &calendarv1.ListCalendarsResponse{}
	for _, c := range cs {
		out.Calendars = append(out.Calendars, toProtoCalendar(c))
	}
	return out, nil
}

// UpdateCalendar cambia datos del tablero (solo propietario).
func (s CalendarServer) UpdateCalendar(ctx context.Context, req *calendarv1.UpdateCalendarRequest) (*calendarv1.Calendar, error) {
	cur, _, err := s.calendar(ctx, req.GetId(), true)
	if err != nil {
		return nil, err
	}
	p := store.CalendarPatch{Name: req.Name, Slug: req.Slug, Timezone: req.Timezone, Country: req.Country, Subdivision: req.Subdivision, Address: req.Address}
	if req.Timezone != nil {
		if _, err := location(req.GetTimezone()); err != nil {
			return nil, err
		}
	}
	if req.Slug != nil && (!slugRe.MatchString(req.GetSlug()) || len(req.GetSlug()) < 3 || len(req.GetSlug()) > 60) {
		return nil, fail(connect.CodeInvalidArgument, "invalid_slug", "%q", req.GetSlug())
	}
	if req.Capacity != nil {
		c := int(req.GetCapacity())
		if c < 1 || c > 50 {
			return nil, fail(connect.CodeInvalidArgument, "invalid_capacity", "1 a 50")
		}
		p.Capacity = &c
	}
	country, sub := cur.Country, cur.Subdivision
	if req.Country != nil {
		country = req.GetCountry()
	}
	if req.Subdivision != nil {
		sub = req.GetSubdivision()
	}
	if err := s.validatePlace(country, sub); err != nil {
		return nil, err
	}
	if ep := req.GetEmbedPolicy(); ep != nil {
		if ep.GetMode() != "any" && ep.GetMode() != "allowlist" {
			return nil, fail(connect.CodeInvalidArgument, "invalid_embed_policy", "%q", ep.GetMode())
		}
		p.EmbedPolicy = &store.EmbedPolicy{Mode: ep.GetMode(), Origins: ep.GetOrigins()}
	}
	if bp := req.GetBookingPolicy(); bp != nil {
		p.BookingPolicy = &store.BookingPolicy{CancelMinNoticeMinutes: int(bp.GetCancelMinNoticeMinutes())}
	}
	c, err := s.Store.UpdateCalendar(ctx, req.GetId(), p)
	if err != nil {
		return nil, storeErr(err)
	}
	return toProtoCalendar(c), nil
}

// ArchiveCalendar archiva o reactiva un tablero.
func (s CalendarServer) ArchiveCalendar(ctx context.Context, req *calendarv1.ArchiveCalendarRequest) (*calendarv1.Calendar, error) {
	if _, _, err := s.calendar(ctx, req.GetId(), true); err != nil {
		return nil, err
	}
	c, err := s.Store.SetArchived(ctx, req.GetId(), req.GetArchived())
	if err != nil {
		return nil, storeErr(err)
	}
	return toProtoCalendar(c), nil
}

// SetOrgStatus refleja el estado de la organización.
func (s CalendarServer) SetOrgStatus(ctx context.Context, req *calendarv1.SetOrgStatusRequest) (*calendarv1.SetOrgStatusResponse, error) {
	a, err := actorOf(ctx)
	if err != nil {
		return nil, err
	}
	if err := requireOrg(a, req.GetOrgId(), "owner"); err != nil {
		return nil, err
	}
	if !statuses[req.GetStatus()] {
		return nil, fail(connect.CodeInvalidArgument, "invalid_status", "%q", req.GetStatus())
	}
	return &calendarv1.SetOrgStatusResponse{}, s.Store.SetOrgStatus(ctx, req.GetOrgId(), req.GetStatus())
}
