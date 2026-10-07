package extsync

import (
	"context"
	"errors"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/emersion/go-ical"
	"github.com/emersion/go-webdav"
	"github.com/emersion/go-webdav/caldav"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
)

// icloud habla CalDAV (iCloud con contraseña específica de app; Radicale en pruebas).
type icloud struct {
	client   *caldav.Client
	endpoint string
}

func newCalDAV(httpClient *http.Client, endpoint, user, pass string) (*icloud, error) {
	c, err := caldav.NewClient(webdav.HTTPClientWithBasicAuth(httpClient, user, pass), endpoint)
	if err != nil {
		return nil, err
	}
	return &icloud{client: c, endpoint: endpoint}, nil
}

// davErr clasifica los errores de go-webdav (su tipo HTTPError es interno: se lee el código del texto).
func davErr(err error) error {
	if err == nil {
		return nil
	}
	s := err.Error()
	switch {
	case strings.Contains(s, "401") || strings.Contains(s, "403"):
		return ErrRevoked
	case strings.Contains(s, "404") || strings.Contains(s, "410"):
		return ErrGone
	case strings.Contains(s, "429") || strings.Contains(s, "503"):
		return ErrRateLimited
	}
	return err
}

// ListCalendars descubre el principal, el calendar-home-set y sus calendarios con eventos.
func (c *icloud) ListCalendars(ctx context.Context) ([]ExtCal, error) {
	principal, err := c.client.FindCurrentUserPrincipal(ctx)
	if err != nil {
		return nil, davErr(err)
	}
	home, err := c.client.FindCalendarHomeSet(ctx, principal)
	if err != nil {
		return nil, davErr(err)
	}
	cals, err := c.client.FindCalendars(ctx, home)
	if err != nil {
		return nil, davErr(err)
	}
	var out []ExtCal
	for _, cal := range cals {
		if len(cal.SupportedComponentSet) > 0 && !contains(cal.SupportedComponentSet, "VEVENT") {
			continue
		}
		name := cal.Name
		if name == "" {
			name = path.Base(strings.TrimSuffix(cal.Path, "/"))
		}
		out = append(out, ExtCal{ID: cal.Path, Name: name, CanEdit: true})
	}
	return out, nil
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if strings.EqualFold(v, x) {
			return true
		}
	}
	return false
}

// FreeBusy pide los VEVENT del rango expandidos por el servidor (calendar-query con expand).
func (c *icloud) FreeBusy(ctx context.Context, ids []string, from, to time.Time) ([]domain.Interval, error) {
	var out []domain.Interval
	for _, id := range ids {
		q := &caldav.CalendarQuery{
			CompRequest: caldav.CalendarCompRequest{
				Name:   "VCALENDAR",
				Comps:  []caldav.CalendarCompRequest{{Name: "VEVENT", Props: []string{"DTSTART", "DTEND", "DURATION", "TRANSP", "STATUS"}}},
				Expand: &caldav.CalendarExpandRequest{Start: from, End: to},
			},
			CompFilter: caldav.CompFilter{Name: "VCALENDAR", Comps: []caldav.CompFilter{{Name: "VEVENT", Start: from, End: to}}},
		}
		objs, err := c.client.QueryCalendar(ctx, id, q)
		if err != nil {
			return nil, davErr(err)
		}
		for _, o := range objs {
			if o.Data == nil {
				continue
			}
			for _, ev := range o.Data.Events() {
				if p := ev.Props.Get(ical.PropTransparency); p != nil && strings.EqualFold(p.Value, "TRANSPARENT") {
					continue
				}
				if p := ev.Props.Get(ical.PropStatus); p != nil && strings.EqualFold(p.Value, "CANCELLED") {
					continue
				}
				s, err1 := ev.DateTimeStart(time.UTC)
				e, err2 := ev.DateTimeEnd(time.UTC)
				if err1 != nil || err2 != nil || !e.After(s) {
					continue
				}
				if e.After(from) && s.Before(to) {
					out = append(out, domain.Interval{Start: s.UTC(), End: e.UTC()})
				}
			}
		}
	}
	return out, nil
}

// EnsureAppCalendar: iCloud no permite crear calendarios por CalDAV de forma fiable; se escribe en el elegido.
func (c *icloud) EnsureAppCalendar(context.Context, string, string) (ExtCal, error) {
	return ExtCal{}, nil
}

func (c *icloud) objectPath(cal, uid string) string {
	return strings.TrimSuffix(cal, "/") + "/" + strings.NewReplacer("/", "_", "@", "_").Replace(uid) + ".ics"
}

func (c *icloud) Upsert(ctx context.Context, cal, remoteID string, ev Outgoing) (string, string, error) {
	p := remoteID
	if p == "" {
		p = c.objectPath(cal, ev.ICalUID)
	}
	vcal := ical.NewCalendar()
	vcal.Props.SetText(ical.PropVersion, "2.0")
	vcal.Props.SetText(ical.PropProductID, "-//Mi Cita en Tiempo//es")
	vev := ical.NewEvent()
	vev.Props.SetText(ical.PropUID, ev.ICalUID)
	vev.Props.SetDateTime(ical.PropDateTimeStamp, time.Now().UTC())
	vev.Props.SetDateTime(ical.PropDateTimeStart, ev.Start.UTC())
	vev.Props.SetDateTime(ical.PropDateTimeEnd, ev.End.UTC())
	vev.Props.SetText(ical.PropSummary, ev.Summary)
	if ev.Description != "" {
		vev.Props.SetText(ical.PropDescription, ev.Description)
	}
	if ev.Location != "" {
		vev.Props.SetText(ical.PropLocation, ev.Location)
	}
	seq := ical.NewProp(ical.PropSequence)
	seq.Value = itoa(ev.Sequence)
	vev.Props.Set(seq)
	vcal.Children = append(vcal.Children, vev.Component)
	obj, err := c.client.PutCalendarObject(ctx, p, vcal)
	if err != nil {
		return "", "", davErr(err)
	}
	return p, obj.ETag, nil
}

func (c *icloud) Get(ctx context.Context, _, remoteID string) (Remote, error) {
	obj, err := c.client.GetCalendarObject(ctx, remoteID)
	if err != nil {
		return Remote{}, davErr(err)
	}
	evs := obj.Data.Events()
	if len(evs) == 0 {
		return Remote{}, ErrGone
	}
	s, _ := evs[0].DateTimeStart(time.UTC)
	e, _ := evs[0].DateTimeEnd(time.UTC)
	cancelled := false
	if p := evs[0].Props.Get(ical.PropStatus); p != nil && strings.EqualFold(p.Value, "CANCELLED") {
		cancelled = true
	}
	return Remote{ID: remoteID, ETag: obj.ETag, Start: s.UTC(), End: e.UTC(), Cancelled: cancelled}, nil
}

func (c *icloud) Delete(ctx context.Context, _, remoteID string) error {
	err := davErr(c.client.RemoveAll(ctx, remoteID))
	if errors.Is(err, ErrGone) {
		return nil
	}
	return err
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}
