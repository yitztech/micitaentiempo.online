-- ADR 0020: registro de cambios para GET /api/offline/changes.
-- Se alimenta con triggers en la misma transacción que la escritura: un rollback no publica nada y todas las rutas
-- de escritura (servicio, borrado en cascada, migraciones) quedan cubiertas. Solo guarda identificadores.
CREATE TABLE app.sync_changes (
    seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    txid xid8 NOT NULL DEFAULT pg_current_xact_id(),
    org_id text NOT NULL,
    resource text NOT NULL CHECK (resource IN ('business_profile', 'business_location')),
    resource_id text NOT NULL CHECK (char_length(resource_id) BETWEEN 1 AND 64),
    op text NOT NULL CHECK (op IN ('upsert', 'delete')),
    created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX sync_changes_feed ON app.sync_changes (txid, seq);
--> statement-breakpoint
CREATE INDEX sync_changes_org_feed ON app.sync_changes (org_id, txid, seq);
--> statement-breakpoint
CREATE INDEX sync_changes_created ON app.sync_changes (created_at);
--> statement-breakpoint
CREATE FUNCTION app.record_sync_change() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
    row_data record;
    change_op text;
    change_resource text;
    change_id text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        row_data := OLD;
        change_op := 'delete';
    ELSE
        row_data := NEW;
        change_op := 'upsert';
    END IF;
    IF TG_TABLE_NAME = 'business_profiles' THEN
        change_resource := 'business_profile';
        change_id := row_data.org_id;
    ELSE
        change_resource := 'business_location';
        change_id := row_data.id::text;
    END IF;
    INSERT INTO app.sync_changes (org_id, resource, resource_id, op)
    VALUES (row_data.org_id, change_resource, change_id, change_op);
    RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER business_profiles_sync_changes
AFTER INSERT OR UPDATE OR DELETE ON app.business_profiles
FOR EACH ROW EXECUTE FUNCTION app.record_sync_change();
--> statement-breakpoint
CREATE TRIGGER business_locations_sync_changes
AFTER INSERT OR UPDATE OR DELETE ON app.business_locations
FOR EACH ROW EXECUTE FUNCTION app.record_sync_change();
--> statement-breakpoint
-- Filas existentes antes del trigger: cada una recibe su cambio inicial para que tenga revisión.
INSERT INTO app.sync_changes (org_id, resource, resource_id, op)
SELECT org_id, 'business_profile', org_id, 'upsert' FROM app.business_profiles
UNION ALL
SELECT org_id, 'business_location', id::text, 'upsert' FROM app.business_locations;
