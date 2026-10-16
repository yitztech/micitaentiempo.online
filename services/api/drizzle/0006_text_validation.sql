CREATE FUNCTION app.valid_text(value text, max_units integer, multiline boolean)
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
--> statement-breakpoint
ALTER TABLE "app"."organizations" ADD CONSTRAINT "organizations_name_text" CHECK (app.valid_text("app"."organizations"."name", 120, false) AND length(btrim("app"."organizations"."name")) > 0);--> statement-breakpoint
ALTER TABLE "app"."users" ADD CONSTRAINT "users_name_text" CHECK (app.valid_text("app"."users"."name", 120, false) AND ("app"."users"."name" = '' OR length(btrim("app"."users"."name")) > 0));--> statement-breakpoint
ALTER TABLE "app"."users" ADD CONSTRAINT "users_email_length" CHECK (length("app"."users"."email") BETWEEN 3 AND 254);