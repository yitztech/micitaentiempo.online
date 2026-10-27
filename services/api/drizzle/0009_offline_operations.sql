CREATE TABLE "app"."offline_operations" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"org_id" text,
	"actor_user_id" text NOT NULL,
	"action" varchar(64) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."offline_operations" ADD CONSTRAINT "offline_operations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "app"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offline_operations_actor" ON "app"."offline_operations" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "offline_operations_org" ON "app"."offline_operations" USING btree ("org_id","created_at");