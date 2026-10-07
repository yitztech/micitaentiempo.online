package engine_test

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
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

func customer(ctx context.Context, id string) context.Context {
	return auth.WithActor(ctx, auth.Verified{Actor: auth.ActorClaims{UserID: id, Role: "customer", Via: "public"}})
}

func uid(n int) string { return fmt.Sprintf("0192f3c4-0000-7000-8000-%012d", n) }

// reason extrae el motivo estable ("motivo: detalle") de un error Connect.
func reason(err error) string {
	var ce *connect.Error
	if !errors.As(err, &ce) {
		if err == nil {
			return ""
		}
		return err.Error()
	}
	r, _, _ := strings.Cut(ce.Message(), ":")
	return r
}

type fixture struct {
	ctx, owner context.Context
	clk        *clock.Settable
	e          *engine.Engine
	ev         engine.EventServer
	cal, svc   string
	mx         *time.Location
}

// at devuelve el instante de una hora de pared en Ciudad de México.
func (f fixture) at(m time.Month, d, h, mi int) *timestamppb.Timestamp {
	return timestamppb.New(time.Date(2026, m, d, h, mi, 0, 0, f.mx))
}

func (f fixture) list(ctx context.Context, from, to *timestamppb.Timestamp) []*calendarv1.Event {
	r, err := f.ev.ListEvents(ctx, &calendarv1.ListEventsRequest{CalendarId: f.cal, From: from, To: to})
	if err != nil {
		panic(err)
	}
	return r.GetEvents()
}

// setup crea un tablero en CDMX (lunes a viernes de 09:00 a 18:00) con un servicio de 30 minutos.
func setup(t *testing.T, capacity int32) fixture {
	t.Helper()
	pool := testdb.New(t)
	ctx := testdb.Context(t)
	catalog, err := holidays.NewCatalog()
	if err != nil {
		t.Fatal(err)
	}
	clk := &clock.Settable{}
	clk.Set(time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)) // lunes 06:00 en CDMX
	e := &engine.Engine{Store: store.New(pool), Holidays: catalog, Clock: clk}
	e.Occupancy = e.DefaultOccupancy()
	owner := as(ctx, "owner", org)
	c, err := engine.CalendarServer{Engine: e}.CreateCalendar(owner, &calendarv1.CreateCalendarRequest{OrgId: org, OrgStatus: "trialing",
		Name: "Estudio", Timezone: "America/Mexico_City", Capacity: capacity, Address: "Av. Siempre Viva 1"})
	if err != nil {
		t.Fatal(err)
	}
	var shifts []*calendarv1.Shift
	for wd := int32(1); wd <= 5; wd++ {
		shifts = append(shifts, &calendarv1.Shift{Weekday: wd, Kind: "open", Range: &calendarv1.TimeRange{Start: "09:00", End: "18:00"}})
	}
	if _, err := (engine.ScheduleServer{Engine: e}).SetWeeklyHours(owner, &calendarv1.SetWeeklyHoursRequest{CalendarId: c.GetId(), Shifts: shifts}); err != nil {
		t.Fatal(err)
	}
	s, err := engine.ServiceCatalogServer{Engine: e}.CreateService(owner, &calendarv1.CreateServiceRequest{Service: &calendarv1.Service{
		CalendarId: c.GetId(), Name: map[string]string{"es": "Corte", "en": "Haircut"}, DurationMin: 30, SlotStepMin: 30}})
	if err != nil {
		t.Fatal(err)
	}
	mx, _ := time.LoadLocation("America/Mexico_City")
	return fixture{ctx: ctx, owner: owner, clk: clk, e: e, ev: engine.EventServer{Engine: e}, cal: c.GetId(), svc: s.GetId(), mx: mx}
}

func TestReservasSinDobleReserva(t *testing.T) {
	f := setup(t, 2)
	start := f.at(9, 15, 10, 0)

	// 50 visitantes intentan apartar el mismo horario a la vez: solo caben 2.
	var wg sync.WaitGroup
	var mu sync.Mutex
	var won []*calendarv1.Event
	taken := 0
	for i := range 50 {
		wg.Go(func() {
			ev, err := f.ev.HoldSlot(customer(f.ctx, uid(1000+i)), &calendarv1.HoldSlotRequest{
				CalendarId: f.cal, ServiceId: f.svc, Start: start, Attendee: &calendarv1.Attendee{Name: "Ana", Email: "ana@example.com"}})
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil:
				won = append(won, ev)
			case reason(err) == "slot_taken":
				taken++
			default:
				t.Errorf("error inesperado: %v", err)
			}
		})
	}
	wg.Wait()
	if len(won) != 2 || taken != 48 {
		t.Fatalf("ganadores %d, rechazados %d", len(won), taken)
	}

	// Los holds ocupan: solo queda libre el horario siguiente.
	slots, err := engine.AvailabilityServer{Engine: f.e}.GetSlots(f.owner, &calendarv1.GetSlotsRequest{CalendarId: f.cal, ServiceId: f.svc,
		From: start, To: f.at(9, 15, 11, 0)})
	if err != nil {
		t.Fatal(err)
	}
	if len(slots.GetSlots()) != 1 || !slots.GetSlots()[0].GetStart().AsTime().Equal(start.AsTime().Add(30*time.Minute)) {
		t.Fatalf("huecos con holds: %v", slots.GetSlots())
	}

	// Confirmar exige presentar al titular; la cita queda a nombre del cliente verificado.
	h, other := won[0], won[1]
	ana, beto := customer(f.ctx, uid(1)), customer(f.ctx, uid(2))
	if _, err := f.ev.ConfirmHold(ana, &calendarv1.ConfirmHoldRequest{Id: h.GetId(), HolderId: uid(9999)}); reason(err) != "hold_not_found" {
		t.Fatalf("titular ajeno: %v", err)
	}
	conf, err := f.ev.ConfirmHold(ana, &calendarv1.ConfirmHoldRequest{Id: h.GetId(), HolderId: h.GetCreatedBy(), CustomerNotes: "Primera vez"})
	if err != nil || conf.GetStatus() != "confirmed" || conf.GetCustomerUserId() != uid(1) || conf.GetHoldExpiresAt() != nil {
		t.Fatalf("confirmar: %v %v", conf, err)
	}
	if again, err := f.ev.ConfirmHold(ana, &calendarv1.ConfirmHoldRequest{Id: h.GetId(), HolderId: h.GetCreatedBy()}); err != nil || again.GetId() != conf.GetId() {
		t.Fatalf("reintento de confirmación: %v", err)
	}

	// Un cliente solo ve lo suyo; otro cliente no sabe ni que existe.
	if _, err := f.ev.GetEvent(beto, &calendarv1.GetEventRequest{Id: conf.GetId()}); reason(err) != "event_not_found" {
		t.Fatalf("cliente ajeno viendo cita: %v", err)
	}
	if got := f.list(beto, start, f.at(9, 16, 0, 0)); len(got) != 0 {
		t.Fatalf("cliente ajeno lista %d", len(got))
	}
	mine := f.list(ana, start, f.at(9, 16, 0, 0))
	if len(mine) != 1 || mine[0].GetInternalNotes() != "" || mine[0].GetSeat() != 0 {
		t.Fatalf("lo mío: %v", mine)
	}
	if got := f.list(f.owner, start, f.at(9, 16, 0, 0)); len(got) != 2 {
		t.Fatalf("personal ve %d", len(got))
	}
	if _, err := f.ev.CreateEvent(ana, &calendarv1.CreateEventRequest{CalendarId: f.cal, ServiceId: f.svc, Start: start, Rrule: "FREQ=WEEKLY"}); connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Fatalf("cliente creando serie: %v", err)
	}
	if _, err := f.ev.CreateEvent(as(f.ctx, "observer", org), &calendarv1.CreateEventRequest{CalendarId: f.cal, ServiceId: f.svc, Start: start}); connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Fatalf("observador creando: %v", err)
	}

	// El hold no confirmado caduca a los 10 minutos y su asiento vuelve a estar libre.
	f.clk.Set(f.clk.Now().Add(11 * time.Minute))
	if _, err := f.ev.ConfirmHold(beto, &calendarv1.ConfirmHoldRequest{Id: other.GetId(), HolderId: other.GetCreatedBy()}); reason(err) != "hold_expired" {
		t.Fatalf("hold caducado: %v", err)
	}
	if got := f.list(f.owner, start, f.at(9, 16, 0, 0)); len(got) != 1 {
		t.Fatalf("tras caducar, personal ve %d", len(got))
	}
	if _, err := f.ev.HoldSlot(customer(f.ctx, uid(3)), &calendarv1.HoldSlotRequest{CalendarId: f.cal, ServiceId: f.svc, Start: start}); err != nil {
		t.Fatalf("apartar tras caducar: %v", err)
	}
	if n, err := store.ExpireHolds(f.ctx, f.e.Store.Pool, "", f.clk.Now().Add(time.Hour)); err != nil || n != 1 {
		t.Fatalf("limpieza de holds: %d %v", n, err)
	}

	// Fuera de horario, en minutos raros o sin servicio: no se aparta.
	for _, st := range []*timestamppb.Timestamp{f.at(9, 15, 8, 0), f.at(9, 15, 10, 10), f.at(9, 19, 10, 0)} {
		if _, err := f.ev.HoldSlot(customer(f.ctx, uid(4)), &calendarv1.HoldSlotRequest{CalendarId: f.cal, ServiceId: f.svc, Start: st}); reason(err) != "slot_taken" {
			t.Fatalf("hold en %v: %v", st.AsTime(), err)
		}
	}

	// Reprogramar y cancelar por cuenta propia respetan el horario reservable.
	if _, err := f.ev.RescheduleBooking(ana, &calendarv1.RescheduleBookingRequest{Id: conf.GetId(), Start: f.at(9, 15, 20, 0)}); reason(err) != "slot_taken" {
		t.Fatalf("reprogramar fuera de horario: %v", err)
	}
	moved, err := f.ev.RescheduleBooking(ana, &calendarv1.RescheduleBookingRequest{Id: conf.GetId(), Start: f.at(9, 15, 12, 0), ExpectedVersion: conf.GetVersion()})
	if err != nil || moved.GetIcalSequence() != 1 {
		t.Fatalf("reprogramar: %v %v", moved, err)
	}
	if _, err := f.ev.CancelEvent(beto, &calendarv1.CancelEventRequest{Id: conf.GetId()}); reason(err) != "event_not_found" {
		t.Fatalf("cancelar cita ajena: %v", err)
	}
	if _, err := f.ev.MarkAttendance(f.owner, &calendarv1.MarkAttendanceRequest{Id: conf.GetId(), Attendance: "attended"}); reason(err) != "not_started" {
		t.Fatalf("asistencia antes de tiempo: %v", err)
	}
	ics, err := f.ev.RenderICS(ana, &calendarv1.RenderICSRequest{Id: conf.GetId(), Method: "REQUEST", Locale: "en"})
	if err != nil || !strings.Contains(string(ics.GetIcs()), "METHOD:REQUEST") || !strings.Contains(string(ics.GetIcs()), "SUMMARY:Haircut · Estudio") {
		t.Fatalf("ics: %s %v", ics.GetIcs(), err)
	}
	if res, err := f.ev.CancelEvent(ana, &calendarv1.CancelEventRequest{Id: conf.GetId(), Reason: "No puedo"}); err != nil || res.GetCancelled()[0].GetStatus() != "cancelled" {
		t.Fatalf("cancelar: %v", err)
	}
	if b, err := f.ev.ListCustomerBookings(ana, &calendarv1.ListCustomerBookingsRequest{}); err != nil || len(b.GetEvents()) != 0 {
		t.Fatalf("mis citas tras cancelar: %v %v", b, err)
	}
}

func TestBloqueosYPersonal(t *testing.T) {
	f := setup(t, 1)
	// El personal agenda fuera de horario, pero no encima de otra cita.
	a1, err := f.ev.CreateEvent(f.owner, &calendarv1.CreateEventRequest{CalendarId: f.cal, ServiceId: f.svc, Start: f.at(9, 15, 19, 0),
		CustomerUserId: uid(1), Attendee: &calendarv1.Attendee{Name: "Ana"}, IdempotencyKey: "k1"})
	if err != nil {
		t.Fatal(err)
	}
	if again, err := f.ev.CreateEvent(f.owner, &calendarv1.CreateEventRequest{CalendarId: f.cal, ServiceId: f.svc, Start: f.at(9, 15, 19, 0), IdempotencyKey: "k1"}); err != nil || again.GetEvent().GetId() != a1.GetEvent().GetId() {
		t.Fatalf("idempotencia: %v", err)
	}
	if _, err := f.ev.CreateEvent(f.owner, &calendarv1.CreateEventRequest{CalendarId: f.cal, ServiceId: f.svc, Start: f.at(9, 15, 19, 15)}); reason(err) != "slot_taken" {
		t.Fatalf("doble reserva del personal: %v", err)
	}
	// Un bloqueo encima informa las citas afectadas; con cancel_overlapping las cancela.
	blk, err := f.ev.CreateEvent(f.owner, &calendarv1.CreateEventRequest{CalendarId: f.cal, Kind: "block", Title: "Mantenimiento",
		Start: f.at(9, 15, 18, 0), End: f.at(9, 15, 21, 0), CancelOverlapping: true})
	if err != nil || len(blk.GetAffected()) != 1 || blk.GetAffected()[0].GetStatus() != "cancelled" {
		t.Fatalf("bloqueo: %v %v", blk, err)
	}
	if _, err := f.ev.CreateEvent(f.owner, &calendarv1.CreateEventRequest{CalendarId: f.cal, ServiceId: f.svc, Start: f.at(9, 15, 19, 0)}); reason(err) != "slot_blocked" {
		t.Fatalf("cita sobre bloqueo: %v", err)
	}
	// Asistencia: solo cuando ya empezó.
	past, err := f.ev.CreateEvent(f.owner, &calendarv1.CreateEventRequest{CalendarId: f.cal, ServiceId: f.svc, Start: timestamppb.New(f.clk.Now().Add(-2 * time.Hour))})
	if err != nil {
		t.Fatal(err)
	}
	if got, err := f.ev.MarkAttendance(as(f.ctx, "editor", org), &calendarv1.MarkAttendanceRequest{Id: past.GetEvent().GetId(), Attendance: "no_show"}); err != nil || got.GetAttendance() != "no_show" {
		t.Fatalf("asistencia: %v", err)
	}
}

func TestSeries(t *testing.T) {
	f := setup(t, 1)
	editor := as(f.ctx, "editor", org)
	// Una cita suelta el 3.er martes choca con la serie.
	if _, err := f.ev.CreateEvent(f.owner, &calendarv1.CreateEventRequest{CalendarId: f.cal, ServiceId: f.svc, Start: f.at(9, 29, 10, 0)}); err != nil {
		t.Fatal(err)
	}
	req := &calendarv1.CreateEventRequest{CalendarId: f.cal, ServiceId: f.svc, Start: f.at(9, 15, 10, 0), Rrule: "FREQ=WEEKLY;BYDAY=TU;COUNT=10",
		CustomerUserId: uid(1), Title: "Terapia"}
	res, err := f.ev.CreateEvent(editor, req)
	if err != nil || res.GetEvent() != nil || len(res.GetConflicts()) != 1 || res.GetConflicts()[0].GetReason() != "seat_unavailable" {
		t.Fatalf("serie con conflicto (abort): %v %v", res, err)
	}
	req.OnConflict = "skip"
	res, err = f.ev.CreateEvent(editor, req)
	if err != nil || res.GetInstances() != 9 || res.GetSeriesId() == "" {
		t.Fatalf("serie con skip: %v %v", res, err)
	}
	all := f.list(f.owner, f.at(9, 1, 0, 0), f.at(12, 31, 0, 0))
	var inst []*calendarv1.Event
	for _, e := range all {
		if e.GetRecurrence().GetSeriesId() == res.GetSeriesId() {
			inst = append(inst, e)
		}
	}
	if len(inst) != 9 || inst[0].GetRecurrence().GetRecurrenceId() != "2026-09-15T10:00" {
		t.Fatalf("instancias: %d %v", len(inst), inst[0].GetRecurrence())
	}
	// "this": solo esa instancia, que queda como excepción.
	up, err := f.ev.UpdateEvent(editor, &calendarv1.UpdateEventRequest{Id: inst[1].GetId(), Title: ptr("Terapia larga")})
	if err != nil || !up.GetEvent().GetRecurrence().GetIsException() || up.GetEvent().GetTitle() != "Terapia larga" {
		t.Fatalf("this: %v %v", up, err)
	}
	// "following" con cambio de hora: parte la serie y conserva el COUNT restante.
	up, err = f.ev.UpdateEvent(editor, &calendarv1.UpdateEventRequest{Id: inst[4].GetId(), Scope: "following", Start: f.at(10, 20, 11, 0)})
	if err != nil || len(up.GetConflicts()) != 0 {
		t.Fatalf("following: %v %v", up, err)
	}
	newSeries := up.GetEvent().GetRecurrence().GetSeriesId()
	all = f.list(f.owner, f.at(9, 1, 0, 0), f.at(12, 31, 0, 0))
	oldN, newN := 0, 0
	for _, e := range all {
		switch e.GetRecurrence().GetSeriesId() {
		case res.GetSeriesId():
			oldN++
		case newSeries:
			newN++
			if h := e.GetStart().AsTime().In(f.mx).Hour(); h != 11 {
				t.Fatalf("instancia nueva a las %d", h)
			}
		}
	}
	// COUNT=10: 1.ª-2.ª, (3.ª excluida), 4.ª-5.ª quedan en la vieja; las 5 restantes en la nueva.
	if oldN != 4 || newN != 5 {
		t.Fatalf("partición: vieja %d, nueva %d", oldN, newN)
	}
	// "all" desde hoy cancela lo futuro y la serie deja de crecer.
	c, err := f.ev.CancelEvent(editor, &calendarv1.CancelEventRequest{Id: up.GetEvent().GetId(), Scope: "all"})
	if err != nil || len(c.GetCancelled()) != 5 {
		t.Fatalf("cancelar all: %v %v", c, err)
	}
}

func TestSeriesSinFinSeAmplian(t *testing.T) {
	f := setup(t, 1)
	res, err := f.ev.CreateEvent(f.owner, &calendarv1.CreateEventRequest{CalendarId: f.cal, Kind: "block", Title: "Junta",
		Start: f.at(9, 14, 8, 0), End: f.at(9, 14, 9, 0), Rrule: "FREQ=WEEKLY;BYDAY=MO"})
	if err != nil {
		t.Fatal(err)
	}
	if res.GetInstances() < 75 || res.GetInstances() > 80 {
		t.Fatalf("instancias a 18 meses: %d", res.GetInstances())
	}
	// Cancelar una instancia la excluye; el job de ampliación no la recrea.
	if _, err := f.ev.CancelEvent(f.owner, &calendarv1.CancelEventRequest{Id: res.GetEvent().GetId()}); err != nil {
		t.Fatal(err)
	}
	f.clk.Set(f.clk.Now().Add(60 * 24 * time.Hour))
	n, err := f.e.ExtendSeries(f.ctx)
	if err != nil || n < 8 || n > 9 {
		t.Fatalf("ampliación: %d %v", n, err)
	}
	if n, err := f.e.ExtendSeries(f.ctx); err != nil || n != 0 {
		t.Fatalf("segunda pasada: %d %v", n, err)
	}
}
