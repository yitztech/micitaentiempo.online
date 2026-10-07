-- +goose Up
-- Series recurrentes, eventos y reservas (docs/plan/04-motor-calendario.md §4.3, §4.5, §4.7).

CREATE TABLE series (
    id                 uuid PRIMARY KEY DEFAULT uuidv7(),
    calendar_id        uuid NOT NULL REFERENCES calendars ON DELETE CASCADE,
    kind               text NOT NULL CHECK (kind IN ('appointment', 'block')),
    rrule              text NOT NULL,
    dtstart_local      timestamp NOT NULL,
    tzid               text NOT NULL,
    duration_min       int NOT NULL CHECK (duration_min BETWEEN 5 AND 1440),
    until_utc          timestamptz,
    exdates_local      timestamp[] NOT NULL DEFAULT '{}',
    materialized_until timestamptz NOT NULL,
    template           jsonb NOT NULL DEFAULT '{}',
    created_by         uuid NOT NULL,
    version            int NOT NULL DEFAULT 1,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX series_calendar ON series (calendar_id);

CREATE TABLE events (
    id                uuid PRIMARY KEY DEFAULT uuidv7(),
    calendar_id       uuid NOT NULL REFERENCES calendars ON DELETE CASCADE,
    kind              text NOT NULL CHECK (kind IN ('appointment', 'block')),
    status            text NOT NULL CHECK (status IN ('held', 'confirmed', 'cancelled')),
    during            tstzrange NOT NULL CHECK (NOT isempty(during) AND lower_inc(during) AND NOT upper_inc(during)),
    all_day           boolean NOT NULL DEFAULT false,
    seat              smallint NOT NULL DEFAULT 1 CHECK (seat >= 1),
    series_id         uuid REFERENCES series ON DELETE SET NULL,
    recurrence_id     timestamptz,
    is_exception      boolean NOT NULL DEFAULT false,
    service_id        uuid REFERENCES services ON DELETE SET NULL,
    buffer_before_min int NOT NULL DEFAULT 0,
    buffer_after_min  int NOT NULL DEFAULT 0,
    title             text,
    customer_user_id  uuid,
    attendee          jsonb,
    customer_notes    text,
    internal_notes    text,
    attendance        text CHECK (attendance IN ('attended', 'no_show')),
    created_by        uuid NOT NULL,
    created_via       text NOT NULL CHECK (created_via IN ('panel', 'embed', 'public', 'mcp', 'sync', 'system')),
    hold_expires_at   timestamptz,
    ical_uid          text NOT NULL UNIQUE,
    ical_sequence     int NOT NULL DEFAULT 0,
    version           int NOT NULL DEFAULT 1,
    idempotency_key   text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    cancelled_at      timestamptz,
    cancel_reason     text,
    UNIQUE (calendar_id, idempotency_key),
    UNIQUE (series_id, recurrence_id),
    CHECK ((status = 'held') = (hold_expires_at IS NOT NULL))
);

-- Garantía final contra la doble reserva: por tablero y asiento, sin solapes entre citas vivas.
ALTER TABLE events ADD CONSTRAINT events_no_overlap
    EXCLUDE USING gist (calendar_id WITH =, seat WITH =, during WITH &&)
    WHERE (kind = 'appointment' AND status IN ('held', 'confirmed'));

CREATE INDEX events_calendar_during ON events USING gist (calendar_id, during) WHERE status <> 'cancelled';
CREATE INDEX events_customer ON events (customer_user_id, lower(during)) WHERE customer_user_id IS NOT NULL;
CREATE INDEX events_holds ON events (hold_expires_at) WHERE status = 'held';
CREATE INDEX events_series ON events (series_id, lower(during)) WHERE series_id IS NOT NULL;

-- +goose Down
DROP TABLE events;
DROP TABLE series;
