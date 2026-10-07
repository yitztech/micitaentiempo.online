package extsync

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
)

// google habla con la API REST de Google Calendar v3 (permisos: calendarlist.readonly, freebusy,
// app.created). El cliente HTTP ya lleva el token OAuth.
type google struct{ rest restClient }

func newGoogle(c *http.Client, base string) *google {
	return &google{rest: restClient{http: c, base: base + "/calendar/v3"}}
}

func (g *google) ListCalendars(ctx context.Context) ([]ExtCal, error) {
	var res struct {
		Items []struct {
			ID         string `json:"id"`
			Summary    string `json:"summary"`
			Primary    bool   `json:"primary"`
			AccessRole string `json:"accessRole"`
		} `json:"items"`
	}
	if _, err := g.rest.do(ctx, http.MethodGet, "/users/me/calendarList?minAccessRole=freeBusyReader", nil, &res); err != nil {
		return nil, err
	}
	out := make([]ExtCal, 0, len(res.Items))
	for _, it := range res.Items {
		out = append(out, ExtCal{ID: it.ID, Name: it.Summary, Primary: it.Primary, CanEdit: it.AccessRole == "owner" || it.AccessRole == "writer"})
	}
	return out, nil
}

func (g *google) FreeBusy(ctx context.Context, ids []string, from, to time.Time) ([]domain.Interval, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	type item struct {
		ID string `json:"id"`
	}
	req := struct {
		TimeMin string `json:"timeMin"`
		TimeMax string `json:"timeMax"`
		Items   []item `json:"items"`
	}{TimeMin: from.UTC().Format(time.RFC3339), TimeMax: to.UTC().Format(time.RFC3339)}
	for _, id := range ids {
		req.Items = append(req.Items, item{ID: id})
	}
	var res struct {
		Calendars map[string]struct {
			Busy []struct {
				Start time.Time `json:"start"`
				End   time.Time `json:"end"`
			} `json:"busy"`
		} `json:"calendars"`
	}
	if _, err := g.rest.do(ctx, http.MethodPost, "/freeBusy", req, &res); err != nil {
		return nil, err
	}
	var out []domain.Interval
	for _, c := range res.Calendars {
		for _, b := range c.Busy {
			out = append(out, domain.Interval{Start: b.Start.UTC(), End: b.End.UTC()})
		}
	}
	return out, nil
}

func (g *google) EnsureAppCalendar(ctx context.Context, name, tz string) (ExtCal, error) {
	var res struct {
		ID      string `json:"id"`
		Summary string `json:"summary"`
	}
	if _, err := g.rest.do(ctx, http.MethodPost, "/calendars", map[string]string{"summary": name, "timeZone": tz}, &res); err != nil {
		return ExtCal{}, err
	}
	return ExtCal{ID: res.ID, Name: res.Summary, CanEdit: true}, nil
}

type gEvent struct {
	ID                 string                       `json:"id,omitempty"`
	ETag               string                       `json:"etag,omitempty"`
	Status             string                       `json:"status,omitempty"`
	ICalUID            string                       `json:"iCalUID,omitempty"`
	Summary            string                       `json:"summary,omitempty"`
	Description        string                       `json:"description,omitempty"`
	Location           string                       `json:"location,omitempty"`
	Sequence           int                          `json:"sequence,omitempty"`
	Start              gTime                        `json:"start"`
	End                gTime                        `json:"end"`
	ExtendedProperties map[string]map[string]string `json:"extendedProperties,omitempty"`
}

type gTime struct {
	DateTime time.Time `json:"dateTime"`
}

func (g *google) Upsert(ctx context.Context, cal, remoteID string, ev Outgoing) (string, string, error) {
	body := gEvent{ICalUID: ev.ICalUID, Summary: ev.Summary, Description: ev.Description, Location: ev.Location, Sequence: ev.Sequence,
		Start: gTime{ev.Start.UTC()}, End: gTime{ev.End.UTC()}, Status: "confirmed",
		ExtendedProperties: map[string]map[string]string{"private": {"mcet_event_id": ev.EventID}}}
	var res gEvent
	path := "/calendars/" + url.PathEscape(cal) + "/events"
	var err error
	if remoteID == "" {
		_, err = g.rest.do(ctx, http.MethodPost, path, body, &res)
	} else {
		body.ICalUID = ""
		_, err = g.rest.do(ctx, http.MethodPut, path+"/"+url.PathEscape(remoteID), body, &res)
	}
	return res.ID, res.ETag, err
}

func (g *google) Get(ctx context.Context, cal, remoteID string) (Remote, error) {
	var res gEvent
	if _, err := g.rest.do(ctx, http.MethodGet, "/calendars/"+url.PathEscape(cal)+"/events/"+url.PathEscape(remoteID), nil, &res); err != nil {
		return Remote{}, err
	}
	return Remote{ID: res.ID, ETag: res.ETag, Start: res.Start.DateTime.UTC(), End: res.End.DateTime.UTC(), Cancelled: res.Status == "cancelled"}, nil
}

func (g *google) Delete(ctx context.Context, cal, remoteID string) error {
	_, err := g.rest.do(ctx, http.MethodDelete, "/calendars/"+url.PathEscape(cal)+"/events/"+url.PathEscape(remoteID), nil, nil)
	if err == ErrGone { //nolint:errorlint // comparación directa del error clasificado
		return nil
	}
	return err
}

// Watch abre un canal events.watch del calendario de la app (avisos en /hooks/google).
func (g *google) Watch(ctx context.Context, cal, channelID, address, token string) (string, time.Time, error) {
	var res struct {
		ResourceID string `json:"resourceId"`
		Expiration string `json:"expiration"`
	}
	body := map[string]string{"id": channelID, "type": "web_hook", "address": address, "token": token}
	if _, err := g.rest.do(ctx, http.MethodPost, "/calendars/"+url.PathEscape(cal)+"/events/watch", body, &res); err != nil {
		return "", time.Time{}, err
	}
	ms, _ := strconv.ParseInt(res.Expiration, 10, 64)
	exp := time.UnixMilli(ms)
	if ms == 0 {
		exp = time.Now().Add(7 * 24 * time.Hour)
	}
	return res.ResourceID, exp, nil
}
