package config

import "testing"

func setSecrets(t *testing.T) {
	t.Helper()
	t.Setenv("RPC_SECRET_API_TO_CALENDAR", "a-secret-of-at-least-thirty-two-chars-1")
	t.Setenv("RPC_SECRET_CALENDAR_TO_API", "a-secret-of-at-least-thirty-two-chars-2")
	t.Setenv("CALENDAR_TOKEN_ENC_KEY", "a-secret-of-at-least-thirty-two-chars-3")
}

func TestLoadRechazaTestModeEnDominiosReales(t *testing.T) {
	setSecrets(t)
	t.Setenv("DB_PASSWORD", "x")
	t.Setenv("PUBLIC_URL_ES", "https://micitaentiempo.online")
	t.Setenv("PUBLIC_URL_EN", "https://myappointmentontime.online")
	t.Setenv("TEST_MODE", "1")
	if _, err := Load(); err == nil {
		t.Fatal("se esperaba error con TEST_MODE en dominios reales")
	}
	t.Setenv("PUBLIC_URL_ES", "http://micitaentiempo.localhost:8080")
	t.Setenv("PUBLIC_URL_EN", "http://myappointmentontime.localhost:8080")
	if _, err := Load(); err != nil {
		t.Fatalf("no se esperaba error: %v", err)
	}
}

func TestLoadExigeContrasena(t *testing.T) {
	setSecrets(t)
	t.Setenv("DB_PASSWORD", "")
	t.Setenv("PUBLIC_URL_ES", "http://a.localhost")
	t.Setenv("PUBLIC_URL_EN", "http://b.localhost")
	if _, err := Load(); err == nil {
		t.Fatal("se esperaba error sin DB_PASSWORD")
	}
}

func TestLoadExigeSecretosRPC(t *testing.T) {
	t.Setenv("DB_PASSWORD", "x")
	t.Setenv("PUBLIC_URL_ES", "http://a.localhost")
	t.Setenv("PUBLIC_URL_EN", "http://b.localhost")
	t.Setenv("RPC_SECRET_API_TO_CALENDAR", "corto")
	t.Setenv("RPC_SECRET_CALENDAR_TO_API", "corto")
	if _, err := Load(); err == nil {
		t.Fatal("se esperaba error con secretos cortos")
	}
}
