# 0004-outbox-river. Outbox con River

- Estado: aceptada
- Fecha: 2026-10-06

## Contexto

Los avisos de cambios no pueden perderse ni duplicarse.

## Decisión

Cada cambio del motor inserta en su transacción un job de River que publica el evento en `api` (`EventIngress.Publish`), idempotente por `event_id`.

## Consecuencias

Reintentos con espera exponencial; si `api` cae, los eventos esperan en PostgreSQL.
