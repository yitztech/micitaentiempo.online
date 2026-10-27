-- +goose Up
-- Versión monótona del agregado calendario y tombstones de baja para proyección y reconciliación (ADR 0019).

ALTER TABLE calendars ADD COLUMN aggregate_version int NOT NULL DEFAULT 1 CHECK (aggregate_version >= 1);

CREATE TABLE calendar_tombstones (
    calendar_id       uuid PRIMARY KEY,
    org_id            uuid NOT NULL,
    slug              text NOT NULL,
    aggregate_version int NOT NULL CHECK (aggregate_version >= 1),
    deleted_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calendar_tombstones_org ON calendar_tombstones (org_id, calendar_id);

-- +goose Down
DROP TABLE calendar_tombstones;
ALTER TABLE calendars DROP COLUMN aggregate_version;
