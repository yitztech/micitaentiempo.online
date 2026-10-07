CREATE TABLE "app"."inbound_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"org_id" text,
	"calendar_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "inbound_events_pending" ON "app"."inbound_events" USING btree ("received_at") WHERE processed_at is null;