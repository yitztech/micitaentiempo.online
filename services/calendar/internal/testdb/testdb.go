// Package testdb levanta un PostgreSQL 18 real para las pruebas de integración.
package testdb

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/db"
)

// Image es la misma versión de PostgreSQL que producción.
const Image = "postgres:18.6-alpine3.24"

// New arranca un contenedor, aplica las migraciones y devuelve el pool.
// Si no hay Docker disponible, la prueba se salta.
func New(t *testing.T) *pgxpool.Pool {
	t.Helper()
	testcontainers.SkipIfProviderIsNotHealthy(t)
	ctx := context.Background()
	ctr, err := tcpostgres.Run(ctx, Image,
		tcpostgres.WithDatabase("micita"),
		tcpostgres.WithUsername("calendar"),
		tcpostgres.WithPassword("calendar"),
		tcpostgres.BasicWaitStrategies(),
	)
	if err != nil {
		t.Fatalf("PostgreSQL de pruebas: %v", err)
	}
	t.Cleanup(func() { _ = testcontainers.TerminateContainer(ctr) })
	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	pool, err := db.Open(ctx, dsn, 20)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if _, err := pool.Exec(ctx, "create extension if not exists btree_gist"); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(ctx, pool, slog.New(slog.NewTextHandler(io.Discard, nil))); err != nil {
		t.Fatal(err)
	}
	return pool
}

// Context devuelve un contexto con tiempo máximo para la prueba.
func Context(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	t.Cleanup(cancel)
	return ctx
}
