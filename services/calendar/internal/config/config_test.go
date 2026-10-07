package config

import "testing"

func TestLoadRechazaTestModeEnDominiosReales(t *testing.T) {
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
	t.Setenv("DB_PASSWORD", "")
	t.Setenv("PUBLIC_URL_ES", "http://a.localhost")
	t.Setenv("PUBLIC_URL_EN", "http://b.localhost")
	if _, err := Load(); err == nil {
		t.Fatal("se esperaba error sin DB_PASSWORD")
	}
}
