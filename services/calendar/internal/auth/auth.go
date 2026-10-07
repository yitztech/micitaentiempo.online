// Package auth firma y verifica el JWT interno entre api y calendar (ADR 0003).
// HS256 con 60 s de vida; el actor viaja en el claim "act".
package auth

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
	commonv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/common/v1"
)

// Emisores y audiencias del JWT interno.
const (
	IssuerAPI        = "mcet-api"
	IssuerCalendar   = "mcet-calendar"
	AudienceAPI      = "mcet-api"
	AudienceCalendar = "mcet-calendar"
	TokenTTL         = 60 * time.Second
)

// ActorClaims es la forma del actor dentro del JWT (nombres cortos, iguales en TypeScript).
type ActorClaims struct {
	UserID     string `json:"sub,omitempty"`
	OrgID      string `json:"org,omitempty"`
	CalendarID string `json:"cal,omitempty"`
	Role       string `json:"role"`
	Via        string `json:"via,omitempty"`
	Locale     string `json:"loc,omitempty"`
	Timezone   string `json:"tz,omitempty"`
}

type claims struct {
	jwt.Claims
	Actor     ActorClaims `json:"act"`
	RequestID string      `json:"rid,omitempty"`
}

// Key deriva la clave HMAC de 32 bytes a partir del secreto compartido.
func Key(secret string) []byte {
	sum := sha256.Sum256([]byte(secret))
	return sum[:]
}

// Signer firma tokens para una audiencia.
type Signer struct {
	signer   jose.Signer
	issuer   string
	audience string
	now      func() time.Time
}

// NewSigner crea un firmante.
func NewSigner(secret, issuer, audience string) (*Signer, error) {
	if len(secret) < 32 {
		return nil, errors.New("el secreto RPC debe tener al menos 32 caracteres")
	}
	s, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.HS256, Key: Key(secret)},
		(&jose.SignerOptions{}).WithType("JWT"))
	if err != nil {
		return nil, err
	}
	return &Signer{signer: s, issuer: issuer, audience: audience, now: time.Now}, nil
}

// Sign emite un token con el actor y el id de petición.
func (s *Signer) Sign(actor ActorClaims, requestID string) (string, error) {
	now := s.now()
	c := claims{
		Claims: jwt.Claims{
			Issuer:   s.issuer,
			Audience: jwt.Audience{s.audience},
			IssuedAt: jwt.NewNumericDate(now),
			Expiry:   jwt.NewNumericDate(now.Add(TokenTTL)),
		},
		Actor:     actor,
		RequestID: requestID,
	}
	return jwt.Signed(s.signer).Claims(c).Serialize()
}

// Verifier comprueba tokens de un emisor concreto.
type Verifier struct {
	key      []byte
	issuer   string
	audience string
	now      func() time.Time
}

// NewVerifier crea un verificador.
func NewVerifier(secret, issuer, audience string) *Verifier {
	return &Verifier{key: Key(secret), issuer: issuer, audience: audience, now: time.Now}
}

// Verified es el resultado de una verificación correcta.
type Verified struct {
	Actor     ActorClaims
	RequestID string
}

// Verify valida firma, emisor, audiencia y vigencia.
func (v *Verifier) Verify(raw string) (Verified, error) {
	tok, err := jwt.ParseSigned(raw, []jose.SignatureAlgorithm{jose.HS256})
	if err != nil {
		return Verified{}, fmt.Errorf("token mal formado: %w", err)
	}
	var c claims
	if err := tok.Claims(v.key, &c); err != nil {
		return Verified{}, fmt.Errorf("firma inválida: %w", err)
	}
	if err := c.ValidateWithLeeway(jwt.Expected{
		Issuer:      v.issuer,
		AnyAudience: jwt.Audience{v.audience},
		Time:        v.now(),
	}, 5*time.Second); err != nil {
		return Verified{}, fmt.Errorf("token no válido: %w", err)
	}
	if c.Expiry == nil {
		return Verified{}, errors.New("token sin caducidad")
	}
	return Verified{Actor: c.Actor, RequestID: c.RequestID}, nil
}

type ctxKey struct{}

// WithActor guarda el actor verificado en el contexto.
func WithActor(ctx context.Context, v Verified) context.Context {
	return context.WithValue(ctx, ctxKey{}, v)
}

// FromContext devuelve el actor de la petición.
func FromContext(ctx context.Context) (Verified, bool) {
	v, ok := ctx.Value(ctxKey{}).(Verified)
	return v, ok
}

// ToProto convierte el actor del token en el mensaje del contrato.
func (a ActorClaims) ToProto() *commonv1.Actor {
	role := commonv1.Role_value["ROLE_"+upper(a.Role)]
	via := commonv1.Via_value["VIA_"+upper(a.Via)]
	return &commonv1.Actor{
		UserId:     a.UserID,
		OrgId:      a.OrgID,
		CalendarId: a.CalendarID,
		Role:       commonv1.Role(role),
		Via:        commonv1.Via(via),
		Locale:     a.Locale,
		Timezone:   a.Timezone,
	}
}

func upper(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'a' && c <= 'z' {
			b[i] = c - 32
		}
	}
	return string(b)
}
