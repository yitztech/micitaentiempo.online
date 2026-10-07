// Package outbox entrega los eventos de dominio a api (ADR 0004).
// Cada cambio del motor inserta un job de River en su propia transacción; el worker
// llama a EventIngress.Publish con reintentos. api deduplica por event_id.
package outbox

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"
	apiv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/api/v1"
	"github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/api/v1/apiv1connect"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/auth"
	"google.golang.org/protobuf/types/known/structpb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// QueueOutbox es la cola de entrega de eventos.
const QueueOutbox = "outbox"

// Event es un evento de dominio (docs/plan/04-motor-calendario.md §4.8).
type Event struct {
	EventID    string           `json:"event_id"`
	Type       string           `json:"type"`
	OccurredAt time.Time        `json:"occurred_at"`
	OrgID      string           `json:"org_id"`
	CalendarID string           `json:"calendar_id"`
	Actor      auth.ActorClaims `json:"actor"`
	Subject    map[string]any   `json:"subject"`
	Version    int32            `json:"version"`
}

// DeliverArgs son los argumentos del job de entrega.
type DeliverArgs struct {
	Event Event `json:"event"`
}

// Kind identifica el job en River.
func (DeliverArgs) Kind() string { return "deliver_domain_event" }

// InsertOpts: ~15 intentos con espera exponencial cubren alrededor de un día.
func (DeliverArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: QueueOutbox, MaxAttempts: 15}
}

// Worker publica el evento en api.
type Worker struct {
	river.WorkerDefaults[DeliverArgs]
	Client apiv1connect.EventIngressServiceClient
	Signer *auth.Signer
}

// Work entrega el evento; un error hace que River reintente.
func (w *Worker) Work(ctx context.Context, job *river.Job[DeliverArgs]) error {
	ev := job.Args.Event
	subject, err := structpb.NewStruct(ev.Subject)
	if err != nil {
		// Un sujeto no serializable no mejora con reintentos.
		return river.JobCancel(fmt.Errorf("sujeto inválido: %w", err))
	}
	token, err := w.Signer.Sign(auth.ActorClaims{Role: "system", Via: "system"}, ev.EventID)
	if err != nil {
		return err
	}
	callCtx, call := connect.NewClientContext(ctx)
	call.RequestHeader().Set("Authorization", "Bearer "+token)
	call.RequestHeader().Set("X-Request-Id", ev.EventID)
	_, err = w.Client.Publish(callCtx, &apiv1.PublishRequest{Event: &apiv1.DomainEvent{
		EventId:    ev.EventID,
		Type:       ev.Type,
		OccurredAt: timestamppb.New(ev.OccurredAt),
		OrgId:      ev.OrgID,
		CalendarId: ev.CalendarID,
		Actor:      ev.Actor.ToProto(),
		Subject:    subject,
		Version:    ev.Version,
	}})
	return err
}

// Enqueue inserta el evento en la misma transacción que el cambio que lo provoca.
func Enqueue(ctx context.Context, client *river.Client[pgx.Tx], tx pgx.Tx, ev Event) error {
	if ev.EventID == "" || ev.Type == "" {
		return errors.New("evento sin id o sin tipo")
	}
	_, err := client.InsertTx(ctx, tx, DeliverArgs{Event: ev}, nil)
	return err
}

// Migrate aplica las migraciones de River (idempotentes; River lleva su propio registro).
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	migrator, err := rivermigrate.New(riverpgxv5.New(pool), nil)
	if err != nil {
		return err
	}
	_, err = migrator.Migrate(ctx, rivermigrate.DirectionUp, nil)
	return err
}

// Config de la cola.
type Config struct {
	APIURL string
	Signer *auth.Signer
	Logger *slog.Logger
	// Workers adicionales de otros paquetes (sincronización, series…).
	Register func(*river.Workers)
	// Periodic son los jobs periódicos (holds caducados, series…).
	Periodic []*river.PeriodicJob
}

// NewClient crea el cliente de River con el worker de entrega registrado.
func NewClient(pool *pgxpool.Pool, cfg Config) (*river.Client[pgx.Tx], error) {
	workers := river.NewWorkers()
	httpClient := &http.Client{Timeout: 15 * time.Second}
	river.AddWorker(workers, &Worker{
		Client: apiv1connect.NewEventIngressServiceClient(httpClient, cfg.APIURL),
		Signer: cfg.Signer,
	})
	if cfg.Register != nil {
		cfg.Register(workers)
	}
	return river.NewClient(riverpgxv5.New(pool), &river.Config{
		Logger: cfg.Logger,
		Queues: map[string]river.QueueConfig{
			river.QueueDefault: {MaxWorkers: 10},
			QueueOutbox:        {MaxWorkers: 5},
		},
		Workers:      workers,
		PeriodicJobs: cfg.Periodic,
	})
}
