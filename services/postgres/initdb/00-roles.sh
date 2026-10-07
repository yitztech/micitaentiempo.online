#!/bin/sh
# Roles y esquemas por servicio (ADR 0005). Solo se ejecuta con el volumen vacío.
set -eu
: "${API_DB_PASSWORD:?Define API_DB_PASSWORD}"
: "${CALENDAR_DB_PASSWORD:?Define CALENDAR_DB_PASSWORD}"

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     -v api_pw="$API_DB_PASSWORD" -v cal_pw="$CALENDAR_DB_PASSWORD" -v db="$POSTGRES_DB" <<'SQL'
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE ROLE api LOGIN PASSWORD :'api_pw';
CREATE ROLE calendar LOGIN PASSWORD :'cal_pw';
GRANT CONNECT ON DATABASE :"db" TO api, calendar;
-- El migrador de Drizzle ejecuta CREATE SCHEMA IF NOT EXISTS, que exige CREATE en la base.
GRANT CREATE ON DATABASE :"db" TO api;
CREATE SCHEMA app AUTHORIZATION api;
CREATE SCHEMA pgboss AUTHORIZATION api;
CREATE SCHEMA calendar AUTHORIZATION calendar;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER ROLE api SET search_path = app;
ALTER ROLE calendar SET search_path = calendar;
SQL
