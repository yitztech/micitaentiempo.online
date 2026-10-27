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

func TestSlugsRepetidos(t *testing.T) {
	pool := testdb.New(t)
	ctx := testdb.Context(t)
	e := &engine.Engine{Store: store.New(pool), Clock: &clock.Settable{}}
	seen := map[string]bool{}
	for i := range 60 {
		c, err := engine.CalendarServer{Engine: e}.CreateCalendar(as(ctx, "owner", org), &calendarv1.CreateCalendarRequest{
			OrgId: org, OrgStatus: "trialing", Name: "Consultas", Timezone: "America/Mexico_City"})
		if err != nil {
			t.Fatalf("tablero %d: %v", i+1, err)
		}
		if seen[c.GetSlug()] {
			t.Fatalf("slug repetido %s", c.GetSlug())
		}
		seen[c.GetSlug()] = true
	}
}

func TestCierreDeOrganizacion(t *testing.T) {
	pool := testdb.New(t)
	ctx := testdb.Context(t)
	e := &engine.Engine{Store: store.New(pool), Clock: &clock.Settable{}}
	cal, svc := engine.CalendarServer{Engine: e}, engine.ServiceCatalogServer{Engine: e}
	owner := as(ctx, "owner", org)
	otra := "0192f3c4-0000-7000-8000-00000000bbbb"

	c, err := cal.CreateCalendar(owner, &calendarv1.CreateCalendarRequest{OrgId: org, OrgStatus: "trialing", Name: "Estudio", Timezone: "UTC"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CreateService(owner, &calendarv1.CreateServiceRequest{Service: &calendarv1.Service{
		CalendarId: c.GetId(), Name: map[string]string{"es": "Corte"}, DurationMin: 30, SlotStepMin: 30}}); err != nil {
		t.Fatal(err)
	}
	ajeno, err := cal.CreateCalendar(as(ctx, "owner", otra), &calendarv1.CreateCalendarRequest{OrgId: otra, OrgStatus: "trialing", Name: "Ajeno", Timezone: "UTC"})
	if err != nil {
		t.Fatal(err)
	}

	// Solo el propietario de esa organización puede cerrarla.
	if _, err := cal.PurgeOrg(as(ctx, "editor", org), &calendarv1.PurgeOrgRequest{OrgId: org}); connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Fatalf("editor cerrando: %v", err)
	}
	if _, err := cal.PurgeOrg(as(ctx, "owner", otra), &calendarv1.PurgeOrgRequest{OrgId: org}); connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Fatalf("otra organización cerrando: %v", err)
	}

	res, err := cal.PurgeOrg(owner, &calendarv1.PurgeOrgRequest{OrgId: org})
	if err != nil || res.GetCalendarsDeleted() != 1 {
		t.Fatalf("cierre: %v %v", res, err)
	}
	if _, err := cal.GetCalendar(owner, &calendarv1.GetCalendarRequest{Id: c.GetId()}); connect.CodeOf(err) != connect.CodeNotFound {
		t.Fatalf("el tablero sigue: %v", err)
	}
	var services int
	if err := pool.QueryRow(ctx, `select count(*) from services where calendar_id = $1`, c.GetId()).Scan(&services); err != nil || services != 0 {
		t.Fatalf("servicios tras el cierre: %d %v", services, err)
	}
	if _, err := cal.GetCalendar(as(ctx, "owner", otra), &calendarv1.GetCalendarRequest{Id: ajeno.GetId()}); err != nil {
		t.Fatalf("el tablero de otra organización desapareció: %v", err)
	}
}

func TestCalendarAggregateSnapshotsAndReconciliation(t *testing.T) {
	pool := testdb.New(t)
	ctx := testdb.Context(t)
	catalog, err := holidays.NewCatalog()
	if err != nil {
		t.Fatal(err)
	}
	clk := &clock.Settable{}
	clk.Set(time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC))
	e := &engine.Engine{Store: store.New(pool), Holidays: catalog, Clock: clk}
	cal, svc := engine.CalendarServer{Engine: e}, engine.ServiceCatalogServer{Engine: e}
	owner := as(ctx, "owner", org)

	c1, err := cal.CreateCalendar(owner, &calendarv1.CreateCalendarRequest{
		OrgId: org, OrgStatus: "active", Name: "Centro Médico", Timezone: "America/Mexico_City", Country: "MX",
	})
	if err != nil {
		t.Fatal(err)
	}

	snaps1, err := cal.ListCalendarSnapshots(owner, &calendarv1.ListCalendarSnapshotsRequest{OrgId: org})
	if err != nil {
		t.Fatal(err)
	}
	if len(snaps1.GetSnapshots()) != 1 {
		t.Fatalf("esperaba 1 snapshot, obtuve %d", len(snaps1.GetSnapshots()))
	}
	snap := snaps1.GetSnapshots()[0]
	if snap.GetAggregateVersion() != 1 || snap.GetState() != "active" || snap.GetHasActiveServices() {
		t.Fatalf("snapshot inesperado en alta: %+v", snap)
	}

	// Al agregar servicio, la versión del agregado pasa a 2 y hasActiveServices = true
	s1, err := svc.CreateService(owner, &calendarv1.CreateServiceRequest{
		Service: &calendarv1.Service{
			CalendarId: c1.GetId(), Name: map[string]string{"es": "Consulta"}, DurationMin: 30, SlotStepMin: 30,
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	snaps2, err := cal.ListCalendarSnapshots(owner, &calendarv1.ListCalendarSnapshotsRequest{OrgId: org})
	if err != nil {
		t.Fatal(err)
	}
	snap2 := snaps2.GetSnapshots()[0]
	if snap2.GetAggregateVersion() != 2 || !snap2.GetHasActiveServices() {
		t.Fatalf("snapshot tras alta de servicio: %+v", snap2)
	}

	// Al actualizar tablero, la versión pasa a 3
	newName := "Centro Médico y Dental"
	if _, err := cal.UpdateCalendar(owner, &calendarv1.UpdateCalendarRequest{
		Id: c1.GetId(), Name: &newName,
	}); err != nil {
		t.Fatal(err)
	}
	snaps3, err := cal.ListCalendarSnapshots(owner, &calendarv1.ListCalendarSnapshotsRequest{OrgId: org})
	if err != nil {
		t.Fatal(err)
	}
	snap3 := snaps3.GetSnapshots()[0]
	if snap3.GetAggregateVersion() != 3 {
		t.Fatalf("snapshot tras update: %+v", snap3)
	}

	// Al archivar, la versión pasa a 4 y state = archived
	if _, err := cal.ArchiveCalendar(owner, &calendarv1.ArchiveCalendarRequest{
		Id: c1.GetId(), Archived: true,
	}); err != nil {
		t.Fatal(err)
	}
	snaps4, err := cal.ListCalendarSnapshots(owner, &calendarv1.ListCalendarSnapshotsRequest{OrgId: org})
	if err != nil {
		t.Fatal(err)
	}
	snap4 := snaps4.GetSnapshots()[0]
	if snap4.GetAggregateVersion() != 4 || snap4.GetState() != "archived" {
		t.Fatalf("snapshot tras archivar: %+v", snap4)
	}

	// PurgeOrg registra tombstone con aggregateVersion 5 y state deleted
	if _, err := cal.PurgeOrg(owner, &calendarv1.PurgeOrgRequest{OrgId: org}); err != nil {
		t.Fatal(err)
	}
	snaps5, err := cal.ListCalendarSnapshots(owner, &calendarv1.ListCalendarSnapshotsRequest{OrgId: org})
	if err != nil {
		t.Fatal(err)
	}
	if len(snaps5.GetSnapshots()) != 1 {
		t.Fatalf("esperaba 1 tombstone, obtuve %d", len(snaps5.GetSnapshots()))
	}
	tombstone := snaps5.GetSnapshots()[0]
	if tombstone.GetAggregateVersion() != 5 || tombstone.GetState() != "deleted" || tombstone.GetHasActiveServices() {
		t.Fatalf("tombstone tras purge: %+v", tombstone)
	}

	// Verificación de que delete de servicio también incrementa versión si hay calendario activo
	c2, err := cal.CreateCalendar(owner, &calendarv1.CreateCalendarRequest{
		OrgId: org, OrgStatus: "active", Name: "Sede 2", Timezone: "UTC",
	})
	if err != nil {
		t.Fatal(err)
	}
	s2, err := svc.CreateService(owner, &calendarv1.CreateServiceRequest{
		Service: &calendarv1.Service{CalendarId: c2.GetId(), Name: map[string]string{"es": "Servicio"}, DurationMin: 15},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.DeleteService(owner, &calendarv1.DeleteServiceRequest{CalendarId: c2.GetId(), Id: s2.GetId()}); err != nil {
		t.Fatal(err)
	}
	snaps6, err := cal.ListCalendarSnapshots(owner, &calendarv1.ListCalendarSnapshotsRequest{OrgId: org, Cursor: tombstone.GetCalendarId()})
	if err != nil {
		t.Fatal(err)
	}
	if len(snaps6.GetSnapshots()) != 1 || snaps6.GetSnapshots()[0].GetAggregateVersion() != 3 || snaps6.GetSnapshots()[0].GetHasActiveServices() {
		t.Fatalf("snapshot tras delete service: %+v", snaps6.GetSnapshots())
	}
	_ = s1
}
