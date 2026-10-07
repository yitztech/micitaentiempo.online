// Command calendar es el motor de calendario de Mi Cita en Tiempo.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
	_ "time/tzdata" // respaldo de la base de zonas horarias si la imagen no la trae

	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/auth"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/clock"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/config"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/db"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/httpapi"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/outbox"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/rpc"
	"golang.org/x/sync/errgroup"
)

// revision se fija en la compilación con -ldflags "-X main.revision=<sha>".
var revision = "dev"

func main() {
	cmd := "serve"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	var err error
	switch cmd {
	case "serve":
		err = serve()
	case "migrate":
		err = migrate()
	case "healthcheck":
		err = healthcheck()
	case "version":
		fmt.Println(revision)
	default:
		fmt.Fprintln(os.Stderr, "uso: calendar serve | migrate | healthcheck | version")
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func newLogger(level string) *slog.Logger {
	var l slog.Level
	_ = l.UnmarshalText([]byte(strings.ToUpper(level)))
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: l})).With("service", "calendar")
}

func migrate() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx := context.Background()
	pool, err := db.Open(ctx, cfg.DSN(), cfg.DBPoolMax)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool, newLogger(cfg.LogLevel)); err != nil {
		return err
	}
	return outbox.Migrate(ctx, pool)
}

func serve() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	log := newLogger(cfg.LogLevel)
	slog.SetDefault(log)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := db.Open(ctx, cfg.DSN(), cfg.DBPoolMax)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool, log); err != nil {
		return err
	}
	if err := outbox.Migrate(ctx, pool); err != nil {
		return fmt.Errorf("migraciones de River: %w", err)
	}

	signer, err := auth.NewSigner(cfg.RPCSecretCalendarToAPI, auth.IssuerCalendar, auth.AudienceAPI)
	if err != nil {
		return err
	}
	jobs, err := outbox.NewClient(pool, outbox.Config{APIURL: cfg.APIRPCURL, Signer: signer, Logger: log})
	if err != nil {
		return err
	}
	if err := jobs.Start(ctx); err != nil {
		return fmt.Errorf("arranque de River: %w", err)
	}

	internalMux := httpapi.InternalMux(pool)
	rpcOpts := rpc.Options{
		Revision: revision,
		Verifier: auth.NewVerifier(cfg.RPCSecretAPIToCalendar, auth.IssuerAPI, auth.AudienceCalendar),
	}
	if cfg.TestMode {
		log.Warn("TEST_MODE activo: reloj controlable expuesto en el puerto interno")
		rpcOpts.TestClock = &clock.Settable{}
	}
	rpc.Mount(internalMux, rpcOpts)

	public := httpapi.NewServer(cfg.PublicAddr, httpapi.PublicMux(revision))
	internal := httpapi.NewServer(cfg.InternalAddr, internalMux)
	g, gctx := errgroup.WithContext(ctx)
	for _, srv := range []*http.Server{public, internal} {
		g.Go(func() error {
			log.Info("escuchando", "addr", srv.Addr, "revision", revision)
			if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				return err
			}
			return nil
		})
	}
	g.Go(func() error {
		<-gctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		return errors.Join(public.Shutdown(shutdownCtx), internal.Shutdown(shutdownCtx), jobs.Stop(shutdownCtx))
	})
	return g.Wait()
}

// healthcheck lo usa el compose: la imagen distroless no tiene wget ni shell.
func healthcheck() error {
	addr := os.Getenv("PUBLIC_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	_, portText, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("PUBLIC_ADDR: %w", err)
	}
	port, err := strconv.Atoi(portText)
	if err != nil || port < 1 || port > 65535 {
		return fmt.Errorf("puerto no válido en PUBLIC_ADDR: %q", portText)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	// Siempre localhost y un puerto numérico validado: no hay destino controlable desde fuera.
	url := fmt.Sprintf("http://127.0.0.1:%d/healthz", port)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil) //nolint:gosec // destino fijo en localhost
	if err != nil {
		return err
	}
	res, err := http.DefaultClient.Do(req) //nolint:gosec // destino fijo en localhost
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("healthz devolvió %d", res.StatusCode)
	}
	return nil
}
