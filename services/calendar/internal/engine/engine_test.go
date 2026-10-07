package engine_test

import (
	"context"
	"testing"
	"time"

	"connectrpc.com/connect"
	calendarv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/calendar/v1"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/auth"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/clock"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/engine"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/holidays"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/store"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/testdb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

const org = "0192f3c4-0000-7000-8000-00000000aaaa"

func as(ctx context.Context, role, orgID string) context.Context {
	return auth.WithActor(ctx, auth.Verified{Actor: auth.ActorClaims{UserID: "0192f3c4-0000-7000-8000-00000000cafe", OrgID: orgID, Role: role}})
}

func TestTableroCompleto(t *testing.T) {
	pool := testdb.New(t)
	ctx := testdb.Context(t)
	catalog, err := holidays.NewCatalog()
	if err != nil {
		t.Fatal(err)
	}
	clk := &clock.Settable{}
	clk.Set(time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)) // lunes 06:00 en CDMX
	e := &engine.Engine{Store: store.New(pool), Holidays: catalog, Clock: clk}
	cal, sch, svc, av := engine.CalendarServer{Engine: e}, engine.ScheduleServer{Engine: e}, engine.ServiceCatalogServer{Engine: e}, engine.AvailabilityServer{Engine: e}
	owner := as(ctx, "owner", org)

	c1, err := cal.CreateCalendar(owner, &calendarv1.CreateCalendarRequest{OrgId: org, OrgStatus: "trialing", Name: "Clínica Sol", Timezone: "America/Mexico_City", Country: "MX"})
	if err != nil {
		t.Fatal(err)
	}
	c2, err := cal.CreateCalendar(owner, &calendarv1.CreateCalendarRequest{OrgId: org, OrgStatus: "trialing", Name: "Clínica Sol", Timezone: "America/Mexico_City"})
	if err != nil {
		t.Fatal(err)
	}
	if c1.GetSlug() != "clinica-sol" || c2.GetSlug() != "clinica-sol-2" {
		t.Fatalf("slugs: %s, %s", c1.GetSlug(), c2.GetSlug())
	}

	// Un editor no cambia ajustes y otra organización no ve nada.
	if _, err := sch.SetWeeklyHours(as(ctx, "editor", org), &calendarv1.SetWeeklyHoursRequest{CalendarId: c1.GetId()}); connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Fatalf("editor cambiando horario: %v", err)
	}
	if _, err := cal.ListCalendars(as(ctx, "owner", "0192f3c4-0000-7000-8000-00000000bbbb"), &calendarv1.ListCalendarsRequest{OrgId: org}); connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Fatalf("otra organización listando: %v", err)
	}

	var shifts []*calendarv1.Shift
	for wd := int32(1); wd <= 5; wd++ {
		shifts = append(shifts,
			&calendarv1.Shift{Weekday: wd, Kind: "open", Range: &calendarv1.TimeRange{Start: "09:00", End: "18:00"}},
			&calendarv1.Shift{Weekday: wd, Kind: "break", Label: "Comida", Range: &calendarv1.TimeRange{Start: "14:00", End: "15:00"}})
	}
	if _, err := sch.SetWeeklyHours(owner, &calendarv1.SetWeeklyHoursRequest{CalendarId: c1.GetId(), Shifts: shifts}); err != nil {
		t.Fatal(err)
	}
	if _, err := sch.SetHolidayPolicies(owner, &calendarv1.SetHolidayPoliciesRequest{CalendarId: c1.GetId(),
		Policies: []*calendarv1.HolidayPolicy{{Country: "MX", Types: []string{"public"}, Substitutes: true}}}); err != nil {
		t.Fatal(err)
	}
	if _, err := sch.SetHolidayPolicies(owner, &calendarv1.SetHolidayPoliciesRequest{CalendarId: c1.GetId(),
		Policies: []*calendarv1.HolidayPolicy{{Country: "ZZ"}}}); connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Fatalf("país inexistente: %v", err)
	}
	s, err := svc.CreateService(owner, &calendarv1.CreateServiceRequest{Service: &calendarv1.Service{
		CalendarId: c1.GetId(), Name: map[string]string{"es": "Consulta general", "en": "General consultation"}, DurationMin: 30, SlotStepMin: 30}})
	if err != nil {
		t.Fatal(err)
	}
	hs, err := sch.ListHolidays(owner, &calendarv1.ListHolidaysRequest{CalendarId: c1.GetId(), From: "2026-09-01", To: "2026-09-30", Locale: "en"})
	if err != nil || len(hs.GetHolidays()) != 1 || hs.GetHolidays()[0].GetName() != "Independence Day" {
		t.Fatalf("feriados: %v %v", hs, err)
	}

	slots := func() map[int]int {
		res, err := av.GetSlots(as(ctx, "customer", ""), &calendarv1.GetSlotsRequest{
			CalendarId: c1.GetId(), ServiceId: s.GetId(),
			From: timestamppb.New(time.Date(2026, 9, 14, 6, 0, 0, 0, time.UTC)),
			To:   timestamppb.New(time.Date(2026, 9, 17, 6, 0, 0, 0, time.UTC)),
		})
		if err != nil {
			t.Fatal(err)
		}
		mx, _ := time.LoadLocation("America/Mexico_City")
		count := map[int]int{}
		for _, sl := range res.GetSlots() {
			count[sl.GetStart().AsTime().In(mx).Day()]++
		}
		return count
	}
	if got := slots(); got[14] != 16 || got[15] != 16 || got[16] != 0 {
		t.Fatalf("huecos por día: %v (14→16, 15→16, 16 feriado→0)", got)
	}
	if _, err := sch.UpsertDateOverride(owner, &calendarv1.UpsertDateOverrideRequest{CalendarId: c1.GetId(),
		Override: &calendarv1.DateOverride{Date: "2026-09-16", Kind: "open_on_holiday"}}); err != nil {
		t.Fatal(err)
	}
	if got := slots(); got[16] != 16 {
		t.Fatalf("abriendo el feriado: %v", got)
	}
	if _, err := cal.SetOrgStatus(owner, &calendarv1.SetOrgStatusRequest{OrgId: org, Status: "read_only"}); err != nil {
		t.Fatal(err)
	}
	if _, err := cal.UpdateCalendar(owner, &calendarv1.UpdateCalendarRequest{Id: c1.GetId(), Name: ptr("Otro")}); connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Fatalf("en solo lectura no se edita: %v", err)
	}
}

func ptr[T any](v T) *T { return &v }
