package outbox_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5"
	apiv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/api/v1"
	"github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/api/v1/apiv1connect"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/auth"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/outbox"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/testdb"
)

const secret = "secreto-calendar-a-api-de-al-menos-32-caracteres"

// fakeAPI imita EventIngress de api: exige el JWT del motor y deduplica por event_id.
type fakeAPI struct {
	verifier *auth.Verifier
	mu       sync.Mutex
	seen     map[string]int
	got      chan *apiv1.DomainEvent
}

func (f *fakeAPI) Publish(ctx context.Context, req *apiv1.PublishRequest) (*apiv1.PublishResponse, error) {
	call, _ := connect.CallInfoForHandlerContext(ctx)
	raw, _ := strings.CutPrefix(call.RequestHeader().Get("Authorization"), "Bearer ")
	if _, err := f.verifier.Verify(raw); err != nil {
		return nil, connect.NewError(connect.CodeUnauthenticated, err)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.seen[req.GetEvent().GetEventId()]++
	dup := f.seen[req.GetEvent().GetEventId()] > 1
	if !dup {
		f.got <- req.GetEvent()
	}
	return &apiv1.PublishResponse{Duplicate: dup}, nil
}

func TestEventoTransaccionalLlegaAApi(t *testing.T) {
	pool := testdb.New(t)
	ctx := testdb.Context(t)
	if err := outbox.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}

	api := &fakeAPI{
		verifier: auth.NewVerifier(secret, auth.IssuerCalendar, auth.AudienceAPI),
		seen:     map[string]int{},
		got:      make(chan *apiv1.DomainEvent, 4),
	}
	mux := http.NewServeMux()
	mux.Handle(apiv1connect.NewEventIngressServiceHandler(api))
	srv := httptest.NewServer(mux)
	defer srv.Close()

	signer, err := auth.NewSigner(secret, auth.IssuerCalendar, auth.AudienceAPI)
	if err != nil {
		t.Fatal(err)
	}
	client, err := outbox.NewClient(pool, outbox.Config{
		APIURL: srv.URL, Signer: signer, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := client.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = client.Stop(context.Background()) }()

	ev := outbox.Event{
		EventID: "0192f3c4-0000-7000-8000-000000000001", Type: "booking.created",
		OccurredAt: time.Now().UTC(), OrgID: "org-1", CalendarID: "cal-1",
		Actor:   auth.ActorClaims{UserID: "u1", Role: "customer", Via: "embed"},
		Subject: map[string]any{"status": "confirmed"}, Version: 1,
	}

	// Una transacción revertida no publica nada.
	errRollback := errors.New("rollback")
	_ = pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		if err := outbox.Enqueue(ctx, client, tx, outbox.Event{EventID: "revertido", Type: "booking.created"}); err != nil {
			t.Fatal(err)
		}
		return errRollback
	})
	if err := pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error { return outbox.Enqueue(ctx, client, tx, ev) }); err != nil {
		t.Fatal(err)
	}

	select {
	case got := <-api.got:
		if got.GetEventId() != ev.EventID || got.GetActor().GetUserId() != "u1" {
			t.Fatalf("evento inesperado: %v", got)
		}
		if got.GetSubject().GetFields()["status"].GetStringValue() != "confirmed" {
			t.Fatalf("sujeto perdido: %v", got.GetSubject())
		}
	case <-ctx.Done():
		t.Fatal("el evento no llegó a api")
	}
	select {
	case extra := <-api.got:
		t.Fatalf("llegó un evento que no debía: %v", extra.GetEventId())
	case <-time.After(1500 * time.Millisecond):
	}
}
