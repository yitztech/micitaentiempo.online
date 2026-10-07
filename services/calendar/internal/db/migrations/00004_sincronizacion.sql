-- +goose Up
-- Sincronización con Google, Outlook y Apple (docs/plan/04-motor-calendario.md §4.9).

-- Feeds ICS (nivel 1): del tablero (completo u «ocupado») o personal de un cliente final.
CREATE TABLE ics_feeds (
    id               uuid PRIMARY KEY DEFAULT uuidv7(),
    org_id           uuid NOT NULL,
    calendar_id      uuid REFERENCES calendars ON DELETE CASCADE,
    customer_user_id uuid,
    scope            text NOT NULL CHECK (scope IN ('full', 'busy', 'personal')),
    locale           text NOT NULL DEFAULT 'es' CHECK (locale IN ('es', 'en')),
    token_hash       text NOT NULL UNIQUE,
    label            text,
    created_by       uuid NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    revoked_at       timestamptz,
    CHECK ((scope = 'personal') = (customer_user_id IS NOT NULL)),
    CHECK (scope = 'personal' OR calendar_id IS NOT NULL)
);
CREATE INDEX ics_feeds_calendar ON ics_feeds (calendar_id);

-- Conexiones directas (nivel 2): credenciales cifradas (AES-256-GCM, clave por HKDF, con id de clave).
CREATE TABLE connections (
    id             uuid PRIMARY KEY DEFAULT uuidv7(),
    calendar_id    uuid NOT NULL REFERENCES calendars ON DELETE CASCADE,
    provider       text NOT NULL CHECK (provider IN ('google', 'microsoft', 'icloud')),
    account        text NOT NULL,
    status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'error')),
    credentials    bytea NOT NULL,
    key_id         text NOT NULL,
    last_sync_at   timestamptz,
    last_error     text,
    last_error_at  timestamptz,
    busy_until     timestamptz,
    created_by     uuid NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (calendar_id, provider, account)
);

CREATE TABLE external_calendars (
    id                 uuid PRIMARY KEY DEFAULT uuidv7(),
    connection_id      uuid NOT NULL REFERENCES connections ON DELETE CASCADE,
    external_id        text NOT NULL,
    name               text NOT NULL,
    use_as_busy        boolean NOT NULL DEFAULT true,
    write_target       boolean NOT NULL DEFAULT false,
    app_created        boolean NOT NULL DEFAULT false,
    sync_token         text,
    channel_id         text,
    channel_resource   text,
    channel_expires_at timestamptz,
    ctag               text,
    UNIQUE (connection_id, external_id)
);

-- Ocupado externo (vigencia corta; se refresca bajo demanda y en la reconciliación).
CREATE TABLE external_busy (
    connection_id uuid NOT NULL REFERENCES connections ON DELETE CASCADE,
    calendar_id   uuid NOT NULL REFERENCES calendars ON DELETE CASCADE,
    during        tstzrange NOT NULL,
    fetched_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX external_busy_during ON external_busy USING gist (calendar_id, during);

-- Nuestro evento ↔ su copia en el proveedor.
CREATE TABLE external_links (
    event_id      uuid NOT NULL REFERENCES events ON DELETE CASCADE,
    connection_id uuid NOT NULL REFERENCES connections ON DELETE CASCADE,
    external_id   text NOT NULL,
    etag          text,
    synced_start  timestamptz NOT NULL,
    synced_end    timestamptz NOT NULL,
    deleted       boolean NOT NULL DEFAULT false,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, connection_id)
);

-- +goose Down
DROP TABLE external_links;
DROP TABLE external_busy;
DROP TABLE external_calendars;
DROP TABLE connections;
DROP TABLE ics_feeds;
