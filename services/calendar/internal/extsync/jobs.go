package extsync

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/store"
)

// QueueSync es la cola de sincronización (concurrencia limitada por memoria).
const QueueSync = "sync"

// PushArgs: escribir un evento en los calendarios conectados.
type PushArgs struct {
	CalendarID string `json:"calendar_id"`
	EventID    string `json:"event_id"`
}

// Kind identifica el job.
func (PushArgs) Kind() string { return "sync_push" }

// InsertOpts del job.
func (PushArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: QueueSync, MaxAttempts: 8}
}

// ReconcileArgs: reconciliar una conexión.
type ReconcileArgs struct {
	ConnectionID string `json:"connection_id"`
}

// Kind identifica el job.
func (ReconcileArgs) Kind() string { return "sync_reconcile" }

// InsertOpts: uno por conexión y minuto (los avisos pueden llegar en ráfaga).
func (ReconcileArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: QueueSync, MaxAttempts: 5, UniqueOpts: river.UniqueOpts{ByArgs: true, ByPeriod: time.Minute}}
}

// ReconcileAllArgs: job periódico que encola la reconciliación de cada conexión activa.
type ReconcileAllArgs struct{}

// Kind identifica el job.
func (ReconcileAllArgs) Kind() string { return "sync_reconcile_all" }

type pushWorker struct {
	river.WorkerDefaults[PushArgs]
	s *Syncer
}

func (w *pushWorker) Work(ctx context.Context, job *river.Job[PushArgs]) error {
	return retryable(w.s.Push(ctx, job.Args.CalendarID, job.Args.EventID))
}

type reconcileWorker struct {
	river.WorkerDefaults[ReconcileArgs]
	s *Syncer
}

func (w *reconcileWorker) Work(ctx context.Context, job *river.Job[ReconcileArgs]) error {
	return retryable(w.s.Reconcile(ctx, job.Args.ConnectionID))
}

type reconcileAllWorker struct {
	river.WorkerDefaults[ReconcileAllArgs]
	s *Syncer
}

func (w *reconcileAllWorker) Work(ctx context.Context, _ *river.Job[ReconcileAllArgs]) error {
	conns, err := store.ActiveConnections(ctx, w.s.Store.Pool, "")
	if err != nil {
		return err
	}
	for _, c := range conns {
		if _, err := w.s.Jobs.Insert(ctx, ReconcileArgs{ConnectionID: c.ID}, nil); err != nil {
			return err
		}
	}
	return nil
}

// retryable: una credencial revocada no mejora con reintentos.
func retryable(err error) error {
	if errors.Is(err, ErrRevoked) {
		return river.JobCancel(err)
	}
	return err
}

// RegisterWorkers añade los workers de sincronización.
func RegisterWorkers(w *river.Workers, s *Syncer) {
	river.AddWorker(w, &pushWorker{s: s})
	river.AddWorker(w, &reconcileWorker{s: s})
	river.AddWorker(w, &reconcileAllWorker{s: s})
}

// PeriodicJobs: reconciliación cada 10 min (iCloud no avisa: es su sondeo).
func PeriodicJobs() []*river.PeriodicJob {
	return []*river.PeriodicJob{
		river.NewPeriodicJob(river.PeriodicInterval(10*time.Minute),
			func() (river.JobArgs, *river.InsertOpts) { return ReconcileAllArgs{}, nil },
			&river.PeriodicJobOpts{RunOnStart: false}),
	}
}

// EnqueuePush encola la escritura de un evento en la transacción que lo cambia.
func (s *Syncer) EnqueuePush(ctx context.Context, tx pgx.Tx, calendarID, eventID string) error {
	if s == nil || s.Jobs == nil {
		return nil
	}
	_, err := s.Jobs.InsertTx(ctx, tx, PushArgs{CalendarID: calendarID, EventID: eventID}, nil)
	return err
}

// EnqueueReconcile encola la reconciliación de una conexión.
func (s *Syncer) EnqueueReconcile(ctx context.Context, connectionID string) error {
	if s.Jobs == nil {
		return s.Reconcile(ctx, connectionID)
	}
	_, err := s.Jobs.Insert(ctx, ReconcileArgs{ConnectionID: connectionID}, nil)
	return err
}
