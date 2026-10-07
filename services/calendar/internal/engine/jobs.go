package engine

import (
	"context"
	"time"

	"github.com/riverqueue/river"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/store"
)

// ExpireHoldsArgs: job periódico que libera los holds caducados.
type ExpireHoldsArgs struct{}

// Kind identifica el job.
func (ExpireHoldsArgs) Kind() string { return "expire_holds" }

// ExpireHoldsWorker libera holds caducados (la ocupación ya los ignora; esto deja la tabla limpia).
type ExpireHoldsWorker struct {
	river.WorkerDefaults[ExpireHoldsArgs]
	Engine *Engine
}

// Work ejecuta el job.
func (w *ExpireHoldsWorker) Work(ctx context.Context, _ *river.Job[ExpireHoldsArgs]) error {
	_, err := store.ExpireHolds(ctx, w.Engine.Store.Pool, "", w.Engine.Clock.Now())
	return err
}

// ExtendSeriesArgs: job diario que materializa las series hasta 18 meses.
type ExtendSeriesArgs struct{}

// Kind identifica el job.
func (ExtendSeriesArgs) Kind() string { return "extend_series" }

// ExtendSeriesWorker amplía el horizonte de las series.
type ExtendSeriesWorker struct {
	river.WorkerDefaults[ExtendSeriesArgs]
	Engine *Engine
}

// Work ejecuta el job.
func (w *ExtendSeriesWorker) Work(ctx context.Context, _ *river.Job[ExtendSeriesArgs]) error {
	_, err := w.Engine.ExtendSeries(ctx)
	return err
}

// Timeout: una pasada larga no debe cortarse al minuto por defecto.
func (w *ExtendSeriesWorker) Timeout(*river.Job[ExtendSeriesArgs]) time.Duration {
	return 10 * time.Minute
}

// RegisterWorkers añade los workers del motor.
func RegisterWorkers(workers *river.Workers, e *Engine) {
	river.AddWorker(workers, &ExpireHoldsWorker{Engine: e})
	river.AddWorker(workers, &ExtendSeriesWorker{Engine: e})
}

// PeriodicJobs son los jobs periódicos del motor.
func PeriodicJobs() []*river.PeriodicJob {
	return []*river.PeriodicJob{
		river.NewPeriodicJob(river.PeriodicInterval(time.Minute),
			func() (river.JobArgs, *river.InsertOpts) { return ExpireHoldsArgs{}, nil },
			&river.PeriodicJobOpts{RunOnStart: true}),
		river.NewPeriodicJob(river.PeriodicInterval(6*time.Hour),
			func() (river.JobArgs, *river.InsertOpts) { return ExtendSeriesArgs{}, nil },
			&river.PeriodicJobOpts{RunOnStart: true}),
	}
}
