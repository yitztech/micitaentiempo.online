package extsync

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
)

// microsoft habla con Microsoft Graph (Outlook / Microsoft 365) con REST directo (ADR 0017).
type microsoft struct{ rest restClient }

func newMicrosoft(c *http.Client, base string) *microsoft {
	return &microsoft{rest: restClient{http: c, base: base}}
}

// msTime es dateTime + timeZone de Graph; siempre pedimos y enviamos UTC.
type msTime struct {
	DateTime string `json:"dateTime"`
	TimeZone string `json:"timeZone"`
}

func toMS(t time.Time) msTime {
	return msTime{DateTime: t.UTC().Format("2006-01-02T15:04:05"), TimeZone: "UTC"}
}

func (m msTime) time() time.Time {
	s := m.DateTime
	if i := strings.IndexByte(s, '.'); i > 0 {
		s = s[:i]
	}
	t, _ := time.Parse("2006-01-02T15:04:05", s)
	return t.UTC()
}

func (m *microsoft) ListCalendars(ctx context.Context) ([]ExtCal, error) {
	var res struct {
		Value []struct {
			ID                string `json:"id"`
			Name              string `json:"name"`
			CanEdit           bool   `json:"canEdit"`
			IsDefaultCalendar bool   `json:"isDefaultCalendar"`
		} `json:"value"`
	}
	if _, err := m.rest.do(ctx, http.MethodGet, "/me/calendars?$select=id,name,canEdit,isDefaultCalendar", nil, &res); err != nil {
		return nil, err
	}
	out := make([]ExtCal, 0, len(res.Value))
	for _, c := range res.Value {
		out = append(out, ExtCal{ID: c.ID, Name: c.Name, CanEdit: c.CanEdit, Primary: c.IsDefaultCalendar})
	}
	return out, nil
}

// FreeBusy usa calendarView de cada calendario elegido (lo que no esté «libre» ocupa).
func (m *microsoft) FreeBusy(ctx context.Context, ids []string, from, to time.Time) ([]domain.Interval, error) {
	var out []domain.Interval
	for _, id := range ids {
		q := url.Values{
			"startDateTime": {from.UTC().Format(time.RFC3339)},
			"endDateTime":   {to.UTC().Format(time.RFC3339)},
			"$select":       {"start,end,showAs,isCancelled"},
			"$top":          {"500"},
		}
		var res struct {
			Value []struct {
				Start       msTime `json:"start"`
				End         msTime `json:"end"`
				ShowAs      string `json:"showAs"`
				IsCancelled bool   `json:"isCancelled"`
			} `json:"value"`
		}
		if _, err := m.rest.do(ctx, http.MethodGet, "/me/calendars/"+url.PathEscape(id)+"/calendarView?"+q.Encode(), nil, &res); err != nil {
			return nil, err
		}
		for _, e := range res.Value {
			if e.IsCancelled || e.ShowAs == "free" {
				continue
			}
			out = append(out, domain.Interval{Start: e.Start.time(), End: e.End.time()})
		}
	}
	return out, nil
}

func (m *microsoft) EnsureAppCalendar(ctx context.Context, name, _ string) (ExtCal, error) {
	cals, err := m.ListCalendars(ctx)
	if err != nil {
		return ExtCal{}, err
	}
	for _, c := range cals {
		if c.Name == name {
			return c, nil
		}
	}
	var res struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if _, err := m.rest.do(ctx, http.MethodPost, "/me/calendars", map[string]string{"name": name}, &res); err != nil {
		return ExtCal{}, err
	}
	return ExtCal{ID: res.ID, Name: res.Name, CanEdit: true}, nil
}

type msEvent struct {
	ID            string            `json:"id,omitempty"`
	ChangeKey     string            `json:"changeKey,omitempty"`
	Subject       string            `json:"subject,omitempty"`
	Body          map[string]string `json:"body,omitempty"`
	Location      map[string]string `json:"location,omitempty"`
	Start         msTime            `json:"start"`
	End           msTime            `json:"end"`
	IsCancelled   bool              `json:"isCancelled,omitempty"`
	TransactionID string            `json:"transactionId,omitempty"`
}

func (m *microsoft) Upsert(ctx context.Context, cal, remoteID string, ev Outgoing) (string, string, error) {
	body := msEvent{Subject: ev.Summary, Body: map[string]string{"contentType": "text", "content": ev.Description},
		Start: toMS(ev.Start), End: toMS(ev.End)}
	if ev.Location != "" {
		body.Location = map[string]string{"displayName": ev.Location}
	}
	var res msEvent
	var err error
	if remoteID == "" {
		body.TransactionID = ev.EventID // evita duplicados si se reintenta la creación
		_, err = m.rest.do(ctx, http.MethodPost, "/me/calendars/"+url.PathEscape(cal)+"/events", body, &res)
	} else {
		_, err = m.rest.do(ctx, http.MethodPatch, "/me/events/"+url.PathEscape(remoteID), body, &res)
	}
	return res.ID, res.ChangeKey, err
}

func (m *microsoft) Get(ctx context.Context, _, remoteID string) (Remote, error) {
	var res msEvent
	if _, err := m.rest.do(ctx, http.MethodGet, "/me/events/"+url.PathEscape(remoteID)+"?$select=id,changeKey,start,end,isCancelled", nil, &res); err != nil {
		return Remote{}, err
	}
	return Remote{ID: res.ID, ETag: res.ChangeKey, Start: res.Start.time(), End: res.End.time(), Cancelled: res.IsCancelled}, nil
}

func (m *microsoft) Delete(ctx context.Context, _, remoteID string) error {
	_, err := m.rest.do(ctx, http.MethodDelete, "/me/events/"+url.PathEscape(remoteID), nil, nil)
	if err == ErrGone { //nolint:errorlint // error clasificado
		return nil
	}
	return err
}

// Watch crea una suscripción de Graph sobre los eventos del calendario de la app (~3 días; se renueva).
func (m *microsoft) Watch(ctx context.Context, cal, _, address, token string) (string, time.Time, error) {
	exp := time.Now().Add(70 * time.Hour).UTC()
	var res struct {
		ID                 string    `json:"id"`
		ExpirationDateTime time.Time `json:"expirationDateTime"`
	}
	body := map[string]string{
		"changeType":         "created,updated,deleted",
		"notificationUrl":    address,
		"resource":           "me/calendars/" + cal + "/events",
		"expirationDateTime": exp.Format(time.RFC3339),
		"clientState":        token,
	}
	if _, err := m.rest.do(ctx, http.MethodPost, "/subscriptions", body, &res); err != nil {
		return "", time.Time{}, err
	}
	if res.ExpirationDateTime.IsZero() {
		res.ExpirationDateTime = exp
	}
	return res.ID, res.ExpirationDateTime, nil
}
