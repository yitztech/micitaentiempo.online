CREATE TABLE "app"."business_calendar_locations" (
	"calendar_id" uuid PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"location_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."business_calendar_projection" (
	"calendar_id" uuid PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"aggregate_version" integer NOT NULL,
	"state" varchar(16) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"has_active_services" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_calendar_projection_state" CHECK ("app"."business_calendar_projection"."state" IN ('active','archived','deleted')),
	CONSTRAINT "business_calendar_projection_version" CHECK ("app"."business_calendar_projection"."aggregate_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "app"."business_categories" (
	"code" varchar(64) PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."business_images" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" text NOT NULL,
	"storage_key" varchar(255) NOT NULL,
	"mime_type" varchar(32) NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"alt" varchar(255) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"cover" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_images_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "business_image_format" CHECK ("app"."business_images"."mime_type" IN ('image/jpeg','image/png','image/webp')),
	CONSTRAINT "business_image_dimensions" CHECK ("app"."business_images"."bytes" BETWEEN 1 AND 5242880 AND "app"."business_images"."width" > 0 AND "app"."business_images"."height" > 0 AND "app"."business_images"."width"::bigint * "app"."business_images"."height"::bigint <= 25000000),
	CONSTRAINT "business_image_key" CHECK ("app"."business_images"."storage_key" ~ '^[a-zA-Z0-9_-]+$'),
	CONSTRAINT "business_image_alt" CHECK (length(btrim("app"."business_images"."alt")) > 0 AND app.valid_text("app"."business_images"."alt", 510, false))
);
--> statement-breakpoint
CREATE TABLE "app"."business_locations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" text NOT NULL,
	"name" varchar(150) NOT NULL,
	"country" varchar(2) NOT NULL,
	"region" varchar(200) DEFAULT '' NOT NULL,
	"locality" varchar(200) NOT NULL,
	"locality_key" varchar(600) NOT NULL,
	"address" varchar(200) DEFAULT '' NOT NULL,
	"postal_code" varchar(10) DEFAULT '' NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"address_visibility" varchar(16) DEFAULT 'locality' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_location_country" CHECK ("app"."business_locations"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "business_location_visibility" CHECK ("app"."business_locations"."address_visibility" IN ('public','locality')),
	CONSTRAINT "business_location_coordinates" CHECK (("app"."business_locations"."latitude" IS NULL AND "app"."business_locations"."longitude" IS NULL) OR ("app"."business_locations"."latitude" IS NOT NULL AND "app"."business_locations"."longitude" IS NOT NULL AND "app"."business_locations"."latitude" BETWEEN -90 AND 90 AND "app"."business_locations"."longitude" BETWEEN -180 AND 180)),
	CONSTRAINT "business_location_name" CHECK (length(btrim("app"."business_locations"."name")) > 0 AND app.valid_text("app"."business_locations"."name", 300, false)),
	CONSTRAINT "business_location_locality" CHECK (length(btrim("app"."business_locations"."locality")) > 0 AND app.valid_text("app"."business_locations"."locality", 400, false)),
	CONSTRAINT "business_location_address" CHECK (app.valid_text("app"."business_locations"."address", 400, false)),
	CONSTRAINT "business_location_region" CHECK (app.valid_text("app"."business_locations"."region", 400, false)),
	CONSTRAINT "business_location_postal" CHECK (app.valid_text("app"."business_locations"."postal_code", 20, false))
);
--> statement-breakpoint
CREATE TABLE "app"."business_profile_categories" (
	"org_id" text NOT NULL,
	"category_id" varchar(64) NOT NULL,
	CONSTRAINT "business_profile_categories_org_id_category_id_pk" PRIMARY KEY("org_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "app"."business_profiles" (
	"org_id" text PRIMARY KEY NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"description" varchar(5000) DEFAULT '' NOT NULL,
	"primary_category_id" varchar(64),
	"website_url" varchar(2048),
	"terms_url" varchar(2048),
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_profile_state" CHECK ("app"."business_profiles"."status" in ('draft','published','unpublished')),
	CONSTRAINT "business_profile_version" CHECK ("app"."business_profiles"."version" >= 1),
	CONSTRAINT "business_profile_name" CHECK (length(btrim("app"."business_profiles"."display_name")) > 0 AND app.valid_text("app"."business_profiles"."display_name", 240, false)),
	CONSTRAINT "business_profile_description" CHECK (app.valid_text("app"."business_profiles"."description", 10000, true)),
	CONSTRAINT "business_profile_publication" CHECK ("app"."business_profiles"."status" <> 'published' OR ("app"."business_profiles"."primary_category_id" IS NOT NULL AND length(btrim("app"."business_profiles"."description")) > 0 AND "app"."business_profiles"."published_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "app"."business_social_links" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" text NOT NULL,
	"platform" varchar(32) NOT NULL,
	"url" varchar(2048) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_social_platform" CHECK ("app"."business_social_links"."platform" IN ('facebook','instagram','linkedin','youtube','tiktok','x','threads','pinterest'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "business_calendar_projection_org_id" ON "app"."business_calendar_projection" USING btree ("org_id","calendar_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_locations_org_id" ON "app"."business_locations" USING btree ("org_id","id");--> statement-breakpoint
ALTER TABLE "app"."business_calendar_locations" ADD CONSTRAINT "business_calendar_location_same_org" FOREIGN KEY ("org_id","location_id") REFERENCES "app"."business_locations"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."business_calendar_locations" ADD CONSTRAINT "business_calendar_projection_same_org" FOREIGN KEY ("org_id","calendar_id") REFERENCES "app"."business_calendar_projection"("org_id","calendar_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."business_calendar_projection" ADD CONSTRAINT "business_calendar_projection_org_id_business_profiles_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "app"."business_profiles"("org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."business_images" ADD CONSTRAINT "business_images_org_id_business_profiles_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "app"."business_profiles"("org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."business_locations" ADD CONSTRAINT "business_locations_org_id_business_profiles_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "app"."business_profiles"("org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."business_profile_categories" ADD CONSTRAINT "business_profile_categories_org_id_business_profiles_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "app"."business_profiles"("org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."business_profile_categories" ADD CONSTRAINT "business_profile_categories_category_id_business_categories_code_fk" FOREIGN KEY ("category_id") REFERENCES "app"."business_categories"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."business_profiles" ADD CONSTRAINT "business_profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "app"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."business_profiles" ADD CONSTRAINT "business_profiles_primary_category_id_business_categories_code_fk" FOREIGN KEY ("primary_category_id") REFERENCES "app"."business_categories"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."business_social_links" ADD CONSTRAINT "business_social_links_org_id_business_profiles_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "app"."business_profiles"("org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "business_calendar_projection_eligible" ON "app"."business_calendar_projection" USING btree ("org_id","state","has_active_services");--> statement-breakpoint
CREATE UNIQUE INDEX "business_images_cover" ON "app"."business_images" USING btree ("org_id") WHERE cover;--> statement-breakpoint

CREATE INDEX "business_locations_search" ON "app"."business_locations" USING btree ("country","region","locality_key","org_id");--> statement-breakpoint
CREATE INDEX "business_profiles_public_category" ON "app"."business_profiles" USING btree ("status","primary_category_id","org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_social_links_platform" ON "app"."business_social_links" USING btree ("org_id","platform");
--> statement-breakpoint
INSERT INTO app.business_categories(code, position) VALUES
('health',0),('beauty',1),('wellness',2),('sport',3),('education',4),('consulting',5),
('professional_services',6),('home',7),('automotive',8),('pets',9),('events',10),('other',11);
--> statement-breakpoint
-- Lock the parent before checking cross-row quotas, including concurrent direct SQL writes.
CREATE FUNCTION app.guard_business_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_count integer; max_count integer; primary_code text; media_bytes bigint;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.org_id <> OLD.org_id THEN
    RAISE EXCEPTION 'business ownership is immutable' USING ERRCODE = '23514';
  END IF;
  SELECT primary_category_id INTO primary_code FROM app.business_profiles WHERE org_id = NEW.org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'business profile missing' USING ERRCODE = '23503'; END IF;
  IF TG_TABLE_NAME = 'business_profile_categories' THEN
    IF NEW.category_id = primary_code THEN
      RAISE EXCEPTION 'duplicate primary category' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'business_images' THEN
    SELECT coalesce(sum(bytes), 0) INTO media_bytes FROM app.business_images WHERE org_id = NEW.org_id AND id <> NEW.id;
    IF media_bytes + NEW.bytes > 41943040 THEN RAISE EXCEPTION 'business media quota exceeded' USING ERRCODE = '23514'; END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    max_count := CASE TG_TABLE_NAME WHEN 'business_locations' THEN 10 WHEN 'business_images' THEN 10
      WHEN 'business_social_links' THEN 8 WHEN 'business_profile_categories' THEN 4 END;
    EXECUTE format('SELECT count(*) FROM app.%I WHERE org_id = $1', TG_TABLE_NAME) INTO current_count USING NEW.org_id;
    IF current_count >= max_count THEN RAISE EXCEPTION 'business quota exceeded' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER business_location_quota BEFORE INSERT OR UPDATE ON app.business_locations
  FOR EACH ROW EXECUTE FUNCTION app.guard_business_child();
--> statement-breakpoint
CREATE TRIGGER business_image_quota BEFORE INSERT OR UPDATE ON app.business_images
  FOR EACH ROW EXECUTE FUNCTION app.guard_business_child();
--> statement-breakpoint
CREATE TRIGGER business_social_quota BEFORE INSERT OR UPDATE ON app.business_social_links
  FOR EACH ROW EXECUTE FUNCTION app.guard_business_child();
--> statement-breakpoint
CREATE TRIGGER business_category_quota BEFORE INSERT OR UPDATE ON app.business_profile_categories
  FOR EACH ROW EXECUTE FUNCTION app.guard_business_child();
--> statement-breakpoint
CREATE FUNCTION app.guard_business_primary_category() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.business_profile_categories WHERE org_id = NEW.org_id AND category_id = NEW.primary_category_id) THEN
    RAISE EXCEPTION 'duplicate primary category' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER business_primary_category_unique BEFORE UPDATE OF primary_category_id ON app.business_profiles
  FOR EACH ROW EXECUTE FUNCTION app.guard_business_primary_category();
