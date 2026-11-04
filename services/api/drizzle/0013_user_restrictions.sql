CREATE TABLE app.user_restrictions (
    user_id text PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,
    reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 2000),
    blocked_at timestamptz NOT NULL DEFAULT now(),
    blocked_by text NOT NULL CHECK (char_length(blocked_by) BETWEEN 1 AND 100),
    reconciliation_required boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
CREATE INDEX user_restrictions_blocked_at ON app.user_restrictions (blocked_at);
--> statement-breakpoint
WITH seeded AS (
    INSERT INTO app.user_restrictions (
        user_id,
        reason,
        blocked_at,
        blocked_by,
        reconciliation_required
    )
    SELECT DISTINCT
        owner_user_id,
        'Suspensión histórica sin causa ni estado económico confirmado',
        now(),
        'system:legacy-reconciliation',
        true
    FROM app.organizations
    WHERE status = 'suspended' AND deleted_at IS NULL
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id
)
INSERT INTO app.audit_log (id, org_id, actor_user_id, via, action, target, metadata)
SELECT
    'legacy-user-restriction:' || seeded.user_id,
    organization.id,
    NULL,
    'system',
    'user.restriction.legacy_quarantined',
    seeded.user_id,
    jsonb_build_object('source', 'organizations.status=suspended', 'reconciliationRequired', true)
FROM seeded
JOIN app.organizations AS organization
  ON organization.owner_user_id = seeded.user_id
 AND organization.status = 'suspended'
 AND organization.deleted_at IS NULL
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
UPDATE app.organizations
SET calendar_status_pending = true
WHERE status = 'suspended' AND deleted_at IS NULL;
--> statement-breakpoint
DELETE FROM app.oauth_access_tokens
WHERE user_id IN (
    SELECT user_id FROM app.user_restrictions WHERE reconciliation_required = true
);
--> statement-breakpoint
DELETE FROM app.oauth_refresh_tokens
WHERE user_id IN (
    SELECT user_id FROM app.user_restrictions WHERE reconciliation_required = true
);
--> statement-breakpoint
DELETE FROM app.sessions
WHERE user_id IN (
    SELECT user_id FROM app.user_restrictions WHERE reconciliation_required = true
);
