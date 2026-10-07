// Package extsync sincroniza los tableros con Google Calendar, Outlook y Apple iCloud y sirve los
// feeds ICS (docs/plan/04-motor-calendario.md §4.9). Nuestro sistema es la fuente de verdad.
package extsync

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
)

// KeyID identifica la clave derivada vigente (permite rotarla: se guarda con cada credencial).
const KeyID = "k1"

// Sealer cifra credenciales con AES-256-GCM y una clave derivada por HKDF de CALENDAR_TOKEN_ENC_KEY.
type Sealer struct{ keys map[string][]byte }

// NewSealer deriva las claves.
func NewSealer(secret string) (*Sealer, error) {
	if len(secret) < 32 {
		return nil, errors.New("CALENDAR_TOKEN_ENC_KEY demasiado corta")
	}
	k, err := hkdf.Key(sha256.New, []byte(secret), []byte("mcet-calendar"), "credenciales:"+KeyID, 32)
	if err != nil {
		return nil, err
	}
	return &Sealer{keys: map[string][]byte{KeyID: k}}, nil
}

// Seal cifra y devuelve nonce||datos junto con el id de clave.
func (s *Sealer) Seal(plain []byte) ([]byte, string, error) {
	gcm, err := s.gcm(KeyID)
	if err != nil {
		return nil, "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, "", err
	}
	return gcm.Seal(nonce, nonce, plain, []byte(KeyID)), KeyID, nil
}

// Open descifra con la clave indicada.
func (s *Sealer) Open(sealed []byte, keyID string) ([]byte, error) {
	gcm, err := s.gcm(keyID)
	if err != nil {
		return nil, err
	}
	if len(sealed) < gcm.NonceSize() {
		return nil, errors.New("credencial cifrada corta")
	}
	return gcm.Open(nil, sealed[:gcm.NonceSize()], sealed[gcm.NonceSize():], []byte(keyID))
}

func (s *Sealer) gcm(keyID string) (cipher.AEAD, error) {
	k, ok := s.keys[keyID]
	if !ok {
		return nil, fmt.Errorf("clave %q desconocida", keyID)
	}
	block, err := aes.NewCipher(k)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// NewToken genera un token de feed de 32 bytes y su hash (solo se guarda el hash).
func NewToken() (token, hash string) {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	token = hex.EncodeToString(b)
	return token, HashToken(token)
}

// HashToken es el hash con el que se guarda y busca un token.
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

var randRead = rand.Read
