package auth

import (
	"strings"
	"testing"
	"time"

	commonv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/common/v1"
)

const secret = "secreto-de-pruebas-de-al-menos-32-caracteres"

func TestFirmaYVerificacion(t *testing.T) {
	s, err := NewSigner(secret, IssuerAPI, AudienceCalendar)
	if err != nil {
		t.Fatal(err)
	}
	tok, err := s.Sign(ActorClaims{UserID: "u1", Role: "editor", Via: "panel", Locale: "es"}, "req-1")
	if err != nil {
		t.Fatal(err)
	}
	got, err := NewVerifier(secret, IssuerAPI, AudienceCalendar).Verify(tok)
	if err != nil {
		t.Fatal(err)
	}
	if got.Actor.UserID != "u1" || got.RequestID != "req-1" {
		t.Fatalf("actor inesperado: %+v", got)
	}
	if p := got.Actor.ToProto(); p.GetRole() != commonv1.Role_ROLE_EDITOR || p.GetVia() != commonv1.Via_VIA_PANEL {
		t.Fatalf("conversión a proto: %v", p)
	}
}

func TestRechazos(t *testing.T) {
	s, _ := NewSigner(secret, IssuerAPI, AudienceCalendar)
	tok, _ := s.Sign(ActorClaims{Role: "owner"}, "")

	cases := map[string]*Verifier{
		"otro secreto":   NewVerifier(strings.Repeat("x", 40), IssuerAPI, AudienceCalendar),
		"otro emisor":    NewVerifier(secret, IssuerCalendar, AudienceCalendar),
		"otra audiencia": NewVerifier(secret, IssuerAPI, AudienceAPI),
	}
	for name, v := range cases {
		if _, err := v.Verify(tok); err == nil {
			t.Errorf("%s: se esperaba rechazo", name)
		}
	}

	caducado := NewVerifier(secret, IssuerAPI, AudienceCalendar)
	caducado.now = func() time.Time { return time.Now().Add(2 * time.Minute) }
	if _, err := caducado.Verify(tok); err == nil {
		t.Error("token caducado aceptado")
	}
	if _, err := NewSigner("corto", IssuerAPI, AudienceCalendar); err == nil {
		t.Error("secreto corto aceptado")
	}
}
