// Package store accede a PostgreSQL (esquema calendar) con pgx.
package store

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

// Errores comunes de la capa de datos.
var (
	ErrNotFound = errors.New("no encontrado")
	ErrConflict = errors.New("conflicto")
)

// Store agrupa las consultas del motor.
type Store struct {
	Pool *pgxpool.Pool
}

// New crea el almacén.
func New(pool *pgxpool.Pool) *Store { return &Store{Pool: pool} }

func notFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

func isUnique(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

// Slugify convierte un nombre en un identificador de URL: «Clínica Sol» → «clinica-sol».
func Slugify(name string) string {
	t := transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)
	plain, _, err := transform.String(t, strings.ToLower(name))
	if err != nil {
		plain = strings.ToLower(name)
	}
	s := strings.Trim(nonSlug.ReplaceAllString(plain, "-"), "-")
	if len(s) > 50 {
		s = strings.Trim(s[:50], "-")
	}
	if len(s) < 3 {
		s = strings.Trim("tablero-"+s, "-")
	}
	return s
}

// tx ejecuta fn en una transacción.
func (s *Store) tx(ctx context.Context, fn func(pgx.Tx) error) error {
	return pgx.BeginFunc(ctx, s.Pool, fn)
}
