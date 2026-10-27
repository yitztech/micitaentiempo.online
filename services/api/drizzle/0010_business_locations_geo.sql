CREATE INDEX IF NOT EXISTS "business_locations_geo" ON "app"."business_locations" USING btree ("latitude","longitude");
