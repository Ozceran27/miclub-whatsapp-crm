-- Provision only the explicitly supported administrative roles. Custom grants are
-- retained; sector operators and future roles must be provisioned explicitly.
WITH canonical(permission) AS (
  VALUES
    ('club:manage'), ('users:manage'), ('imports:run'), ('crm:write'), ('crm:read'),
    ('people:read'), ('finance:read'), ('dashboard:read'), ('sectors:any'),
    ('administration.view'), ('administration.configure'),
    ('sectors.view'), ('sectors.create'), ('sectors.edit'), ('sectors.archive'),
    ('activities.view'), ('activities.create'), ('activities.edit'), ('activities.archive'),
    ('workers.view'), ('workers.manage'),
    ('tasks.view'), ('tasks.create'), ('tasks.edit'), ('tasks.assign'),
    ('requests.view'), ('requests.approve'), ('requests.reject'),
    ('movements.view'), ('movements.create'), ('movements.edit'), ('movements.cancel'),
    ('enrollments.view'), ('enrollments.create'), ('enrollments.edit'), ('enrollments.cancel'),
    ('finance:write')
), changed_memberships AS (
  UPDATE miclub.user_club_memberships AS membership
     SET permissions = ARRAY(
           SELECT DISTINCT permission
             FROM unnest(coalesce(membership.permissions, '{}'::text[]) ||
                         ARRAY(SELECT permission FROM canonical)) AS permission
            ORDER BY permission
         ),
         updated_at = now()
    FROM miclub.roles AS role
   WHERE role.id = membership.role_id
     AND role.club_id = membership.club_id
     AND membership.status = 'active'
     AND role.code IN ('owner', 'DIRECTOR', 'admin')
     AND EXISTS (
       SELECT permission FROM canonical
       EXCEPT
       SELECT unnest(coalesce(membership.permissions, '{}'::text[]))
     )
  RETURNING membership.user_id
)
-- Force affected signed sessions to be renewed with the persisted permission set.
UPDATE miclub.users AS app_user
   SET session_revoked_before = now(), updated_at = now()
 WHERE app_user.id IN (SELECT user_id FROM changed_memberships);
