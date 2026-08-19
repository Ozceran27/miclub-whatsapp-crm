BEGIN;

-- Cookie validation happens before a request can safely bind app.club_id. Keep
-- tenant tables closed and expose only the active membership owned by the
-- authenticated global user. These functions never accept a club identifier
-- on its own, preventing callers from using them as a tenant-data oracle.
CREATE OR REPLACE FUNCTION miclub.resolve_active_membership(
  target_user_id uuid,
  target_membership_id uuid
)
RETURNS TABLE (
  membership_id uuid,
  club_id uuid,
  role_code text,
  permissions text[],
  sector_ids uuid[],
  session_revoked_before timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, miclub
AS $function$
  SELECT membership.id, membership.club_id, role.code,
         membership.permissions, membership.sector_ids,
         app_user.session_revoked_before
    FROM miclub.user_club_memberships membership
    JOIN miclub.users app_user
      ON app_user.id = membership.user_id AND app_user.status = 'active'
    JOIN miclub.clubs club
      ON club.id = membership.club_id AND club.is_active = true
    JOIN miclub.roles role
      ON role.id = membership.role_id AND role.club_id = membership.club_id
   WHERE membership.user_id = target_user_id
     AND membership.id = target_membership_id
     AND membership.status = 'active'
$function$;

CREATE OR REPLACE FUNCTION miclub.list_active_memberships(target_user_id uuid)
RETURNS TABLE (
  membership_id uuid,
  club_id uuid,
  club_name text,
  role_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, miclub
AS $function$
  SELECT membership.id, membership.club_id, club.name, role.code
    FROM miclub.user_club_memberships membership
    JOIN miclub.clubs club
      ON club.id = membership.club_id AND club.is_active = true
    JOIN miclub.roles role
      ON role.id = membership.role_id AND role.club_id = membership.club_id
   WHERE membership.user_id = target_user_id
     AND membership.status = 'active'
   ORDER BY club.name, membership.created_at
$function$;

ALTER FUNCTION miclub.resolve_active_membership(uuid, uuid) OWNER TO miclub_admin;
ALTER FUNCTION miclub.list_active_memberships(uuid) OWNER TO miclub_admin;
REVOKE ALL ON FUNCTION miclub.resolve_active_membership(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION miclub.list_active_memberships(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION miclub.resolve_active_membership(uuid, uuid) TO miclub_runtime;
GRANT EXECUTE ON FUNCTION miclub.list_active_memberships(uuid) TO miclub_runtime;

COMMIT;
