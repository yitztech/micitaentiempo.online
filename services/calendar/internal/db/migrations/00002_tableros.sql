-- +goose Up
-- Tableros, horarios, excepciones, feriados y servicios (docs/plan/04-motor-calendario.md §4.3).

CREATE TABLE org_status (
    org_id     uuid PRIMARY KEY,
    status     text NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'read_only', 'suspended')),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE calendars (
    id             uuid PRIMARY KEY DEFAULT uuidv7(),
    org_id         uuid NOT NULL REFERENCES org_status (org_id),
    slug           text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9](-?[a-z0-9])*$' AND length(slug) BETWEEN 3 AND 60),
    name           text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    timezone       text NOT NULL,
    capacity       smallint NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 50),
    country        text CHECK (country ~ '^[A-Z]{2}$'),
    subdivision    text,
    address        text,
    embed_policy   jsonb NOT NULL DEFAULT '{"mode":"any"}',
    booking_policy jsonb NOT NULL DEFAULT '{}',
    status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calendars_org ON calendars (org_id) WHERE status = 'active';

-- Horario laboral y descansos semanales. Turnos que cruzan medianoche: dos filas.
CREATE TABLE hours (
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    calendar_id uuid NOT NULL REFERENCES calendars ON DELETE CASCADE,
    weekday     smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    kind        text NOT NULL CHECK (kind IN ('open', 'break')),
    label       text,
    start_local time NOT NULL,
    end_local   time NOT NULL CHECK (end_local > start_local)
);
CREATE INDEX hours_calendar ON hours (calendar_id);

CREATE TABLE date_overrides (
    calendar_id uuid NOT NULL REFERENCES calendars ON DELETE CASCADE,
    date_local  date NOT NULL,
    kind        text NOT NULL CHECK (kind IN ('closed', 'custom', 'open_on_holiday')),
    intervals   jsonb,
    note        text,
    PRIMARY KEY (calendar_id, date_local)
);

CREATE TABLE holiday_policies (
    calendar_id uuid NOT NULL REFERENCES calendars ON DELETE CASCADE,
    country     text NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
    subdivision text NOT NULL DEFAULT '',
    types       text[] NOT NULL DEFAULT '{public}',
    substitutes boolean NOT NULL DEFAULT true,
    PRIMARY KEY (calendar_id, country, subdivision)
);

CREATE TABLE custom_holidays (
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    calendar_id uuid NOT NULL REFERENCES calendars ON DELETE CASCADE,
    name        text NOT NULL,
    date_local  date,
    month_day   text CHECK (month_day ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
    CHECK ((date_local IS NULL) <> (month_day IS NULL))
);
CREATE INDEX custom_holidays_calendar ON custom_holidays (calendar_id);

CREATE TABLE services (
    id                uuid PRIMARY KEY DEFAULT uuidv7(),
    calendar_id       uuid NOT NULL REFERENCES calendars ON DELETE CASCADE,
    name              jsonb NOT NULL,
    description       jsonb,
    duration_min      int NOT NULL CHECK (duration_min BETWEEN 5 AND 720),
    buffer_before_min int NOT NULL DEFAULT 0 CHECK (buffer_before_min BETWEEN 0 AND 240),
    buffer_after_min  int NOT NULL DEFAULT 0 CHECK (buffer_after_min BETWEEN 0 AND 240),
    min_notice_min    int NOT NULL DEFAULT 60 CHECK (min_notice_min BETWEEN 0 AND 43200),
    max_advance_days  int NOT NULL DEFAULT 60 CHECK (max_advance_days BETWEEN 1 AND 365),
    slot_step_min     int NOT NULL DEFAULT 30 CHECK (slot_step_min IN (5, 10, 15, 20, 30, 45, 60, 90, 120)),
    daily_limit       int CHECK (daily_limit > 0),
    color             text NOT NULL DEFAULT 'laguna',
    active            boolean NOT NULL DEFAULT true,
    position          int NOT NULL DEFAULT 0
);
CREATE INDEX services_calendar ON services (calendar_id);

-- +goose Down
DROP TABLE services;
DROP TABLE custom_holidays;
DROP TABLE holiday_policies;
DROP TABLE date_overrides;
DROP TABLE hours;
DROP TABLE calendars;
DROP TABLE org_status;
