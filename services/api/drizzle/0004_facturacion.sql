CREATE TABLE "app"."billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app"."organizations" ADD COLUMN "past_due_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."organizations" ADD COLUMN "trial_notice7_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."organizations" ADD COLUMN "trial_notice3_at" timestamp with time zone;