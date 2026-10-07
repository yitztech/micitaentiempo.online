// Package config lee y valida la configuración del motor desde el entorno.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

// Config es la configuración del motor.
type Config struct {
	PublicAddr   string
	InternalAddr string
	DBHost       string
	DBPort       int
	DBName       string
	DBUser       string
	DBPassword   string
	DBPoolMax    int32
	PublicURLES  string
	PublicURLEN  string
	LogLevel     string
	TestMode     bool
	// Secretos del JWT interno (ADR 0003).
	RPCSecretAPIToCalendar string
	RPCSecretCalendarToAPI string
	// URL del RPC interno de api (eventos de dominio).
	APIRPCURL string
}

// productionHosts nunca pueden usarse con TEST_MODE.
var productionHosts = []string{"micitaentiempo.online", "myappointmentontime.online"}

func env(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

// Load valida el entorno. Falla si falta algo obligatorio o si TEST_MODE apunta a dominios reales.
func Load() (Config, error) {
	port, err := strconv.Atoi(env("DB_PORT", "5432"))
	if err != nil {
		return Config{}, fmt.Errorf("DB_PORT: %w", err)
	}
	poolMax, err := strconv.Atoi(env("DB_POOL_MAX", "10"))
	if err != nil {
		return Config{}, fmt.Errorf("DB_POOL_MAX: %w", err)
	}
	c := Config{
		PublicAddr:   env("PUBLIC_ADDR", ":8080"),
		InternalAddr: env("INTERNAL_ADDR", ":8081"),
		DBHost:       env("DB_HOST", "postgres"),
		DBPort:       port,
		DBName:       env("DB_NAME", "micita"),
		DBUser:       env("DB_USER", "calendar"),
		DBPassword:   os.Getenv("DB_PASSWORD"),
		DBPoolMax:    int32(min(max(poolMax, 1), 100)), //nolint:gosec // acotado arriba
		PublicURLES:  env("PUBLIC_URL_ES", ""),
		PublicURLEN:  env("PUBLIC_URL_EN", ""),
		LogLevel:     env("LOG_LEVEL", "info"),
		TestMode:     env("TEST_MODE", "") != "",

		RPCSecretAPIToCalendar: os.Getenv("RPC_SECRET_API_TO_CALENDAR"),
		RPCSecretCalendarToAPI: os.Getenv("RPC_SECRET_CALENDAR_TO_API"),
		APIRPCURL:              env("API_RPC_URL", "http://api:3001"),
	}
	var errs []error
	if c.DBPassword == "" {
		errs = append(errs, errors.New("falta DB_PASSWORD"))
	}
	if len(c.RPCSecretAPIToCalendar) < 32 || len(c.RPCSecretCalendarToAPI) < 32 {
		errs = append(errs, errors.New("RPC_SECRET_API_TO_CALENDAR y RPC_SECRET_CALENDAR_TO_API deben tener al menos 32 caracteres"))
	}
	for _, u := range []string{c.PublicURLES, c.PublicURLEN} {
		if u == "" {
			errs = append(errs, errors.New("faltan PUBLIC_URL_ES y PUBLIC_URL_EN"))
			break
		}
		parsed, err := url.Parse(u)
		if err != nil || parsed.Host == "" {
			errs = append(errs, fmt.Errorf("URL pública inválida: %q", u))
			continue
		}
		if c.TestMode && isProductionHost(parsed.Hostname()) {
			errs = append(errs, errors.New("TEST_MODE está prohibido con dominios reales"))
		}
	}
	return c, errors.Join(errs...)
}

func isProductionHost(host string) bool {
	host = strings.ToLower(host)
	for _, p := range productionHosts {
		if host == p || strings.HasSuffix(host, "."+p) {
			return true
		}
	}
	return false
}

// DSN devuelve la cadena de conexión de pgx.
func (c Config) DSN() string {
	u := url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(c.DBUser, c.DBPassword),
		Host:     fmt.Sprintf("%s:%d", c.DBHost, c.DBPort),
		Path:     "/" + c.DBName,
		RawQuery: "application_name=calendar&sslmode=disable",
	}
	return u.String()
}
