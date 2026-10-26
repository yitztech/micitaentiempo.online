-- Nombres anteriores pueden exceder el nuevo límite; validar en una migración posterior.
ALTER TABLE "app"."users" DROP CONSTRAINT "users_name_text";--> statement-breakpoint
ALTER TABLE "app"."users" ADD CONSTRAINT "users_name_text" CHECK (app.valid_text("name", 200, false) AND ("name" = '' OR length(btrim("name")) > 0)) NOT VALID;--> statement-breakpoint
ALTER TABLE "app"."users" ADD CONSTRAINT "users_name_auth_length" CHECK (char_length("name") <= 100) NOT VALID;
