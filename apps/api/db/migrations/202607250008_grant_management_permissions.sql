BEGIN;

-- Memberships created before public registration had an empty permission set.
-- Preserve custom permissions while restoring the management capabilities
-- expected from existing owner/admin accounts, including migration access.
UPDATE miclub.user_club_memberships AS membership
   SET permissions = ARRAY(
         SELECT DISTINCT permission
           FROM unnest(
             membership.permissions || ARRAY[
               'club:manage',
               'users:manage',
               'sectors:any',
               'finance:write',
               'crm:write',
               'imports:run'
             ]::text[]
           ) AS permission
          ORDER BY permission
       ),
       updated_at = now()
  FROM miclub.roles AS role
 WHERE role.id = membership.role_id
   AND role.club_id = membership.club_id
   AND lower(role.code) IN ('owner', 'admin')
   AND NOT (membership.permissions @> ARRAY['imports:run']::text[]);

COMMIT;
