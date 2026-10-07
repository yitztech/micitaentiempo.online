CREATE TABLE "app"."channel_link_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"data" jsonb,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."notification_channels" (
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"secret" text NOT NULL,
	"label" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_channels_user_id_channel_pk" PRIMARY KEY("user_id","channel")
);
--> statement-breakpoint
CREATE TABLE "app"."notification_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"dedupe_key" text NOT NULL,
	"user_id" text,
	"org_id" text,
	"channel" text NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "app"."notification_mutes" (
	"user_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	CONSTRAINT "notification_mutes_user_id_calendar_id_pk" PRIMARY KEY("user_id","calendar_id")
);
--> statement-breakpoint
CREATE TABLE "app"."notification_preferences" (
	"user_id" text NOT NULL,
	"group" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean NOT NULL,
	CONSTRAINT "notification_preferences_user_id_group_channel_pk" PRIMARY KEY("user_id","group","channel")
);
--> statement-breakpoint
CREATE TABLE "app"."notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text,
	"calendar_id" text,
	"type" text NOT NULL,
	"params" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."reminders" (
	"event_id" text NOT NULL,
	"offset_min" integer NOT NULL,
	"calendar_id" text NOT NULL,
	"org_id" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "reminders_event_id_offset_min_pk" PRIMARY KEY("event_id","offset_min")
);
--> statement-breakpoint
ALTER TABLE "app"."channel_link_tokens" ADD CONSTRAINT "channel_link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."notification_channels" ADD CONSTRAINT "notification_channels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."notification_mutes" ADD CONSTRAINT "notification_mutes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliveries_due" ON "app"."notification_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notifications_user" ON "app"."notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "reminders_due" ON "app"."reminders" USING btree ("due_at");