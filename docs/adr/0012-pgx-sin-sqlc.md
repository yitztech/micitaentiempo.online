# 0012. pgx directo en lugar de sqlc

- Estado: aceptada
- Fecha: 2026-10-06

## Contexto

El plan proponía sqlc para consultas tipadas en el motor. sqlc analiza el SQL con pg_query_go, que exige
cgo, y añade un paso de generación más al flujo.

## Decisión

El motor usa pgx v5 directamente, con funciones de escaneo explícitas por entidad en `internal/store`.
Las restricciones de integridad viven en las migraciones (CHECK, EXCLUDE, claves foráneas) y las consultas se
cubren con pruebas de integración sobre PostgreSQL real (Testcontainers).

## Consecuencias

Compilación sin cgo y un generador menos. A cambio, los errores de columnas se detectan en las pruebas de
integración, no al generar código.
