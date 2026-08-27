BEGIN;

-- Login starts before a tenant can be placed in app.club_id. The ordinary
-- tenant policies must therefore keep failing closed, while this one function
-- exposes only the first complete active context for an already authenticated
-- global user. The API invokes it only after password verification.
CREATE OR REPLACE FUNCTION miclub.resolve_login_membership(target_user_id uuid)
RETURNS TABLE (
  membership_id uuid,
  club_id uuid,
  role_code text,
  permissions text[],
  sector_ids uuid[],
  person_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, miclub
AS $function$
  SELECT membership.id, membership.club_id, role.code,
         membership.permissions, membership.sector_ids, person.id
    FROM miclub.user_club_memberships membership
    JOIN miclub.clubs club
      ON club.id = membership.club_id AND club.is_active = true
    JOIN miclub.roles role
      ON role.id = membership.role_id AND role.club_id = membership.club_id
    JOIN miclub.people person
      ON person.user_id = target_user_id AND person.club_id = membership.club_id
   WHERE membership.user_id = target_user_id
     AND membership.status = 'active'
   ORDER BY membership.created_at, membership.id
   LIMIT 1
$function$;

ALTER FUNCTION miclub.resolve_login_membership(uuid) OWNER TO miclub_admin;
REVOKE ALL ON FUNCTION miclub.resolve_login_membership(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION miclub.resolve_login_membership(uuid) TO miclub_runtime;

-- CLUB is the highest commercial tier and receives the complete current
-- feature catalog. DEVELOPMENT remains non-commercial; no application branch
-- treats it as a customer plan.
INSERT INTO miclub.plan_entitlements (plan_code, feature_code)
SELECT 'CLUB', feature.code
  FROM miclub.features feature
ON CONFLICT (plan_code, feature_code) DO NOTHING;

-- Older/partially provisioned clubs receive the canonical default without
-- replacing any current subscription. Targeted upgrades remain an explicit
-- administrative operation rather than an unsafe heuristic in a migration.
INSERT INTO miclub.club_subscriptions (club_id, plan_code, effective_from)
SELECT club.id, free_plan.code, now()
  FROM miclub.clubs club
  CROSS JOIN LATERAL (
    SELECT code FROM miclub.plans
     WHERE code = 'FREE' AND catalog_status = 'catalog' AND commercial_class = 'free'
     LIMIT 1
  ) free_plan
 WHERE NOT EXISTS (
   SELECT 1 FROM miclub.club_subscriptions subscription
    WHERE subscription.club_id = club.id
      AND subscription.effective_from <= now()
      AND (subscription.effective_until IS NULL OR subscription.effective_until > now())
 );

COMMIT;
