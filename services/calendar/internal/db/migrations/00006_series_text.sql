-- +goose Up
-- Una serie guarda una plantilla, además del texto de sus instancias.
ALTER TABLE series ADD CONSTRAINT series_template_text CHECK (
  jsonb_typeof(template) = 'object'
  AND (NOT template ? 'title' OR (jsonb_typeof(template->'title') = 'string' AND mcet_valid_text(template->>'title', 200, false)))
  AND (NOT template ? 'internal_notes' OR (jsonb_typeof(template->'internal_notes') = 'string' AND mcet_valid_text(template->>'internal_notes', 2000, true)))
  AND (NOT template ? 'attendee' OR (jsonb_typeof(template->'attendee') = 'object'
    AND (NOT (template->'attendee') ? 'name' OR (jsonb_typeof(template->'attendee'->'name') = 'string' AND mcet_valid_text(template->'attendee'->>'name', 120, false)))))
);
-- +goose Down
ALTER TABLE series DROP CONSTRAINT series_template_text;
