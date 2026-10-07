# 0005-esquemas-roles. Esquemas y roles separados en PostgreSQL

- Estado: aceptada
- Fecha: 2026-10-06

## Contexto

Un fallo en un servicio no debe exponer los datos del otro.

## Decisión

Esquema `app` (rol `api`), `pgboss` (rol `api`) y `calendar` (rol `calendar`), creados por la imagen propia de PostgreSQL.

## Consecuencias

Sin claves foráneas entre servicios; datos cruzados por identificador.
