-- Append-only transition from broad legacy grants to operation-specific grants.
-- Existing/custom permissions are preserved. Compatibility guards may be removed
-- after 2026-11-06 when no active legacy holder is missing an equivalent below.
WITH expanded AS (
  SELECT membership.id,
         ARRAY(
           SELECT DISTINCT permission
             FROM unnest(
               coalesce(membership.permissions, '{}'::text[])
               || CASE WHEN 'finance:write' = ANY(coalesce(membership.permissions, '{}'::text[]))
                       THEN ARRAY['movements.edit', 'movements.cancel'] ELSE '{}'::text[] END
               || CASE WHEN 'club:manage' = ANY(coalesce(membership.permissions, '{}'::text[]))
                       THEN ARRAY['enrollments.create', 'enrollments.edit', 'enrollments.cancel'] ELSE '{}'::text[] END
             ) AS permission
            ORDER BY permission
         ) AS permissions
    FROM miclub.user_club_memberships AS membership
   WHERE membership.status = 'active'
     AND ('finance:write' = ANY(coalesce(membership.permissions, '{}'::text[]))
       OR 'club:manage' = ANY(coalesce(membership.permissions, '{}'::text[])))
), changed_memberships AS (
  UPDATE miclub.user_club_memberships AS membership
     SET permissions = expanded.permissions,
         updated_at = now()
    FROM expanded
   WHERE membership.id = expanded.id
     AND membership.permissions IS DISTINCT FROM expanded.permissions
  RETURNING membership.user_id
)
UPDATE miclub.users AS app_user
   SET session_revoked_before = now(), updated_at = now()
 WHERE app_user.id IN (SELECT user_id FROM changed_memberships);
