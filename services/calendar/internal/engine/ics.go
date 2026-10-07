package engine

import (
	"context"

	"connectrpc.com/connect"
	ics "github.com/arran4/golang-ical"
	calendarv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/calendar/v1"
)

// organizers son los remitentes por idioma (el dominio decide el idioma, ADR 0008).
var organizers = map[string]string{
	"es": "no-reply@micitaentiempo.online",
	"en": "no-reply@myappointmentontime.online",
}

var summaries = map[string]string{"es": "Cita", "en": "Appointment"}

// RenderICS genera el iCalendar de un evento para adjuntarlo a correos o descargarlo.
func (s EventServer) RenderICS(ctx context.Context, req *calendarv1.RenderICSRequest) (*calendarv1.RenderICSResponse, error) {
	ev, c, _, err := s.load(ctx, req.GetId())
	if err != nil {
		return nil, err
	}
	method := ics.Method(req.GetMethod())
	switch method {
	case "":
		method = ics.MethodPublish
	case ics.MethodPublish, ics.MethodRequest, ics.MethodCancel:
	default:
		return nil, fail(connect.CodeInvalidArgument, "invalid_method", "%q", method)
	}
	lang := req.GetLocale()
	if _, ok := organizers[lang]; !ok {
		lang = "es"
	}
	summary := ev.Title
	if ev.ServiceID != "" {
		if sv, err := s.Store.GetService(ctx, c.ID, ev.ServiceID); err == nil {
			if n := sv.Name[lang]; n != "" {
				summary = n
			} else {
				for _, n := range sv.Name {
					summary = n
					break
				}
			}
		}
	}
	if summary == "" {
		summary = summaries[lang]
	}
	cal := ics.NewCalendar()
	cal.SetProductId("-//Mi Cita en Tiempo//" + lang)
	cal.SetMethod(method)
	v := cal.AddEvent(ev.ICalUID)
	v.SetDtStampTime(s.Clock.Now())
	v.SetStartAt(ev.Start)
	v.SetEndAt(ev.End)
	v.SetSequence(ev.ICalSequence)
	v.SetSummary(summary + " · " + c.Name)
	if c.Address != "" {
		v.SetLocation(c.Address)
	}
	v.SetOrganizer("mailto:"+organizers[lang], ics.WithCN(c.Name))
	if ev.Attendee.Email != "" {
		v.AddAttendee("mailto:"+ev.Attendee.Email, ics.WithCN(ev.Attendee.Name), ics.ParticipationStatusAccepted)
	}
	if ev.Status == "cancelled" || method == ics.MethodCancel {
		v.SetStatus(ics.ObjectStatusCancelled)
	} else {
		v.SetStatus(ics.ObjectStatusConfirmed)
	}
	return &calendarv1.RenderICSResponse{Ics: []byte(cal.Serialize()), Filename: "cita.ics"}, nil
}
