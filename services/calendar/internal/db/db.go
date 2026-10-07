// Package db abre el pool de PostgreSQL y aplica las migraciones embebidas.
package db

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Open crea el pool de conexiones.
func Open(ctx context.Context, dsn string, maxConns int32) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("configuración de pgx: %w", err)
	}
	cfg.MaxConns = maxConns
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("pool de pgx: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping a PostgreSQL: %w", err)
	}
	return pool, nil
}

// Migrate aplica las migraciones pendientes bajo un bloqueo consultivo de sesión.
func Migrate(ctx context.Context, pool *pgxpool.Pool, log *slog.Logger) error {
	sqlDB := stdlib.OpenDBFromPool(pool)
	defer func() { _ = sqlDB.Close() }()
	return migrateDB(ctx, sqlDB, log)
}

func migrateDB(ctx context.Context, sqlDB *sql.DB, log *slog.Logger) error {
	sub, err := fs.Sub(migrations, "migrations")
	if err != nil {
		return err
	}
	locker, err := lock.NewPostgresSessionLocker()
	if err != nil {
		return err
	}
	provider, err := goose.NewProvider(goose.DialectPostgres, sqlDB, sub, goose.WithSessionLocker(locker))
	if err != nil {
		return fmt.Errorf("proveedor de goose: %w", err)
	}
	results, err := provider.Up(ctx)
	if err != nil {
		return fmt.Errorf("migraciones: %w", err)
	}
	for _, r := range results {
		log.Info("migración aplicada", "version", r.Source.Version, "duracion", r.Duration)
	}
	return nil
}
