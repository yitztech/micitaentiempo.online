-- +goose Up
-- +goose StatementBegin
CREATE FUNCTION mcet_valid_text(value text, max_units integer, multiline boolean)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT coalesce(sum(CASE WHEN ascii(ch) > 65535 THEN 2 ELSE 1 END), 0) <= max_units
    AND coalesce(bool_and(
      NOT (ascii(ch) BETWEEN 0 AND 31 AND NOT (multiline AND ascii(ch) IN (9,10,13)))
      AND ascii(ch) NOT BETWEEN 127 AND 159
      AND ascii(ch) NOT BETWEEN 8234 AND 8238
      AND ascii(ch) NOT BETWEEN 8294 AND 8297
      AND (multiline OR ch NOT IN ('<','>'))
    ), true)
  FROM regexp_split_to_table(value, '') AS chars(ch) WHERE ch <> '';
$$;
-- +goose StatementEnd
ALTER TABLE calendars ADD CONSTRAINT calendars_name_text CHECK (mcet_valid_text(name, 120, false));
ALTER TABLE calendars ADD CONSTRAINT calendars_address_text CHECK (mcet_valid_text(address, 240, false));
ALTER TABLE hours ADD CONSTRAINT hours_label_text CHECK (mcet_valid_text(label, 60, false));
ALTER TABLE date_overrides ADD CONSTRAINT date_overrides_note_text CHECK (mcet_valid_text(note, 200, false));
ALTER TABLE custom_holidays ADD CONSTRAINT custom_holidays_name_text CHECK (mcet_valid_text(name, 120, false));
ALTER TABLE events ADD CONSTRAINT events_title_text CHECK (mcet_valid_text(title, 200, false));
ALTER TABLE events ADD CONSTRAINT events_customer_notes_text CHECK (mcet_valid_text(customer_notes, 1000, true));
ALTER TABLE events ADD CONSTRAINT events_internal_notes_text CHECK (mcet_valid_text(internal_notes, 2000, true));
ALTER TABLE events ADD CONSTRAINT events_cancel_reason_text CHECK (mcet_valid_text(cancel_reason, 500, true));
ALTER TABLE series ADD CONSTRAINT series_rrule_text CHECK (mcet_valid_text(rrule, 300, false));

-- +goose StatementBegin
CREATE FUNCTION mcet_localized_text(value jsonb, max_units integer)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path FROM CURRENT AS $$
  SELECT CASE WHEN jsonb_typeof(value) <> 'object' THEN false ELSE
    NOT EXISTS (SELECT 1 FROM jsonb_each(value) e
      WHERE e.key NOT IN ('es', 'en') OR jsonb_typeof(e.value) <> 'string'
      OR NOT mcet_valid_text(e.value #>> '{}', max_units, max_units > 120)) END;
$$;
-- +goose StatementEnd
ALTER TABLE services ADD CONSTRAINT services_name_text CHECK (mcet_localized_text(name, 120) AND (length(btrim(coalesce(name->>'es',''))) > 0 OR length(btrim(coalesce(name->>'en',''))) > 0));
ALTER TABLE services ADD CONSTRAINT services_description_text CHECK (description = 'null'::jsonb OR mcet_localized_text(description, 1000));
ALTER TABLE events ADD CONSTRAINT events_attendee_text CHECK (
  attendee IS NULL OR (jsonb_typeof(attendee) = 'object'
    AND (NOT attendee ? 'name' OR (jsonb_typeof(attendee->'name') = 'string' AND mcet_valid_text(attendee->>'name', 120, false)))
    AND (NOT attendee ? 'email' OR (jsonb_typeof(attendee->'email') = 'string' AND length(attendee->>'email') <= 254))
    AND (NOT attendee ? 'phone' OR (jsonb_typeof(attendee->'phone') = 'string' AND (attendee->>'phone' = '' OR attendee->>'phone' ~ '^\+[1-9][0-9]{6,14}$'))))
);
-- +goose Down
ALTER TABLE events DROP CONSTRAINT events_attendee_text;
ALTER TABLE services DROP CONSTRAINT services_description_text;
ALTER TABLE services DROP CONSTRAINT services_name_text;
DROP FUNCTION mcet_localized_text(jsonb, integer);
ALTER TABLE calendars DROP CONSTRAINT calendars_name_text;
ALTER TABLE calendars DROP CONSTRAINT calendars_address_text;
ALTER TABLE hours DROP CONSTRAINT hours_label_text;
ALTER TABLE date_overrides DROP CONSTRAINT date_overrides_note_text;
ALTER TABLE custom_holidays DROP CONSTRAINT custom_holidays_name_text;
ALTER TABLE events DROP CONSTRAINT events_title_text;
ALTER TABLE events DROP CONSTRAINT events_customer_notes_text;
ALTER TABLE events DROP CONSTRAINT events_internal_notes_text;
ALTER TABLE events DROP CONSTRAINT events_cancel_reason_text;
ALTER TABLE series DROP CONSTRAINT series_rrule_text;
DROP FUNCTION mcet_valid_text(text, integer, boolean);
