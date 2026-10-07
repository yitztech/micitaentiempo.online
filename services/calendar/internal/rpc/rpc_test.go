package rpc_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"connectrpc.com/connect"
	calendarv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/calendar/v1"
	"github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/calendar/v1/calendarv1connect"
	commonv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/common/v1"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/auth"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/rpc"
)

const secret = "secreto-api-a-calendar-de-al-menos-32-caracteres"

func server(t *testing.T, withTesting bool) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	opts := rpc.Options{Revision: "r1", Verifier: auth.NewVerifier(secret, auth.IssuerAPI, auth.AudienceCalendar)}
	if withTesting {
		opts.TestClock = new(clockSettable)
	}
	rpc.Mount(mux, opts)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func call(t *testing.T, url, token string) (*calendarv1.PingResponse, error) {
	t.Helper()
	ctx, info := connect.NewClientContext(context.Background())
	if token != "" {
		info.RequestHeader().Set("Authorization", "Bearer "+token)
	}
	return calendarv1connect.NewSystemServiceClient(http.DefaultClient, url).Ping(ctx, &calendarv1.PingRequest{})
}

func TestPingConActor(t *testing.T) {
	srv := server(t, false)
	signer, _ := auth.NewSigner(secret, auth.IssuerAPI, auth.AudienceCalendar)
	tok, _ := signer.Sign(auth.ActorClaims{UserID: "u9", Role: "observer", Locale: "en"}, "rid")
	res, err := call(t, srv.URL, tok)
	if err != nil {
		t.Fatal(err)
	}
	if res.GetRevision() != "r1" || res.GetActor().GetRole() != commonv1.Role_ROLE_OBSERVER {
		t.Fatalf("respuesta inesperada: %v", res)
	}
}

func TestPingSinTokenOFalso(t *testing.T) {
	srv := server(t, false)
	for _, tok := range []string{"", "no-es-un-jwt"} {
		if _, err := call(t, srv.URL, tok); connect.CodeOf(err) != connect.CodeUnauthenticated {
			t.Fatalf("token %q: se esperaba Unauthenticated, llegó %v", tok, err)
		}
	}
}

func TestTestingServiceSoloConTestMode(t *testing.T) {
	signer, _ := auth.NewSigner(secret, auth.IssuerAPI, auth.AudienceCalendar)
	tok, _ := signer.Sign(auth.ActorClaims{Role: "system"}, "")
	for _, tc := range []struct {
		testMode bool
		want     connect.Code
	}{{false, connect.CodeUnimplemented}, {true, 0}} {
		srv := server(t, tc.testMode)
		ctx, info := connect.NewClientContext(context.Background())
		info.RequestHeader().Set("Authorization", "Bearer "+tok)
		_, err := calendarv1connect.NewTestingServiceClient(http.DefaultClient, srv.URL).
			SetClock(ctx, &calendarv1.SetClockRequest{})
		if got := connect.CodeOf(err); err != nil && got != tc.want || err == nil && tc.want != 0 {
			t.Fatalf("TEST_MODE=%v: código %v, se esperaba %v", tc.testMode, got, tc.want)
		}
	}
}
