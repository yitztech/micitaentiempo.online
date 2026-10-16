package engine

import (
	"strings"
	"testing"

	"connectrpc.com/connect"
	calendarv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/calendar/v1"
)

func TestServiceTextValidation(t *testing.T) {
	for _, name := range []string{"Consulta López", "李 O’Connor", strings.Repeat("Á", 120), strings.Repeat("🙂", 60)} {
		if _, err := fromProtoService(&calendarv1.Service{Name: map[string]string{"es": name}, DurationMin: 30}); err != nil {
			t.Fatalf("nombre válido %q: %v", name, err)
		}
	}
	for _, name := range []string{" ", strings.Repeat("a", 121), strings.Repeat("🙂", 61), "A\nB", "<script>", "A\u202eB"} {
		if _, err := fromProtoService(&calendarv1.Service{Name: map[string]string{"es": name}, DurationMin: 30}); connect.CodeOf(err) != connect.CodeInvalidArgument {
			t.Fatalf("nombre inválido aceptado %q: %v", name, err)
		}
	}
	for _, text := range []string{strings.Repeat("a", 1001), "A\u0001B"} {
		if _, err := fromProtoService(&calendarv1.Service{Name: map[string]string{"es": "Consulta"}, Description: map[string]string{"es": text}, DurationMin: 30}); connect.CodeOf(err) != connect.CodeInvalidArgument {
			t.Fatalf("descripción inválida aceptada: %v", err)
		}
	}
	if _, err := fromProtoService(&calendarv1.Service{Name: map[string]string{"es": "Consulta"}, Description: map[string]string{"es": "Línea 1\n\tLínea 2"}, DurationMin: 30}); err != nil {
		t.Fatal(err)
	}
}
