-- ESTABILIZACIÓN MANUAL: este archivo NO forma parte del runner de migraciones.
-- canonical-owner-permissions: ["club:manage","users:manage","imports:run","crm:write","crm:read","people:read","finance:read","dashboard:read","sectors:any","administration.view","administration.configure","sectors.view","sectors.create","sectors.edit","sectors.archive","activities.view","activities.create","activities.edit","activities.archive","workers.view","workers.manage","tasks.view","tasks.create","tasks.edit","tasks.assign","requests.view","requests.approve","requests.reject","movements.view","movements.create","movements.edit","movements.cancel","enrollments.view","enrollments.create","enrollments.edit","enrollments.cancel","finance:write"]
-- La prueba permissionCatalog.test.ts compara el marcador anterior con ROLE_DEFAULT_PERMISSIONS.owner.

-- Diagnóstico (solo lectura): muestra diferencias para owner/admin/DIRECTOR existentes.
WITH canonical(permission) AS (
  VALUES
    ('club:manage'),
    ('users:manage'),
    ('imports:run'),
    ('crm:write'),
    ('crm:read'),
    ('people:read'),
    ('finance:read'),
    ('dashboard:read'),
    ('sectors:any'),
    ('administration.view'),
    ('administration.configure'),
    ('sectors.view'),
    ('sectors.create'),
    ('sectors.edit'),
    ('sectors.archive'),
    ('activities.view'),
    ('activities.create'),
    ('activities.edit'),
    ('activities.archive'),
    ('workers.view'),
    ('workers.manage'),
    ('tasks.view'),
    ('tasks.create'),
    ('tasks.edit'),
    ('tasks.assign'),
    ('requests.view'),
    ('requests.approve'),
    ('requests.reject'),
    ('movements.view'),
    ('movements.create'),
    ('movements.edit'),
    ('movements.cancel'),
    ('enrollments.view'),
    ('enrollments.create'),
    ('enrollments.edit'),
    ('enrollments.cancel'),
    ('finance:write')
)
SELECT membership.id AS membership_id, role.code,
       ARRAY(SELECT permission FROM canonical EXCEPT SELECT unnest(membership.permissions)) AS missing_permissions,
       ARRAY(SELECT unnest(membership.permissions) EXCEPT SELECT permission FROM canonical) AS custom_permissions
  FROM miclub.user_club_memberships membership
  JOIN miclub.roles role ON role.id = membership.role_id AND role.club_id = membership.club_id
 WHERE lower(role.code) IN ('owner', 'admin', 'director');

-- CORRECCIÓN MANUAL. La tabla temporal vacía hace que ejecutar el archivo sea inocuo.
-- Después de revisar el diagnóstico, descomente únicamente los IDs aprobados.
BEGIN;
CREATE TEMP TABLE approved_memberships (id uuid PRIMARY KEY) ON COMMIT DROP;
-- INSERT INTO approved_memberships (id) VALUES ('00000000-0000-0000-0000-000000000000');

WITH canonical(permission) AS (
  VALUES
    ('club:manage'), ('users:manage'), ('imports:run'), ('crm:write'), ('crm:read'), ('people:read'),
    ('finance:read'), ('dashboard:read'), ('sectors:any'),
    ('administration.view'), ('administration.configure'),
    ('sectors.view'), ('sectors.create'), ('sectors.edit'), ('sectors.archive'),
    ('activities.view'), ('activities.create'), ('activities.edit'), ('activities.archive'),
    ('workers.view'), ('workers.manage'), ('tasks.view'), ('tasks.create'), ('tasks.edit'), ('tasks.assign'),
    ('requests.view'), ('requests.approve'), ('requests.reject'),
    ('movements.view'), ('movements.create'), ('movements.edit'), ('movements.cancel'),
    ('enrollments.view'), ('enrollments.create'), ('enrollments.edit'), ('enrollments.cancel'), ('finance:write')
)
UPDATE miclub.user_club_memberships membership
   SET permissions = ARRAY(
         SELECT DISTINCT permission
           FROM unnest(coalesce(membership.permissions, '{}'::text[]) ||
                       ARRAY(SELECT permission FROM canonical)) AS permission
          ORDER BY permission
       ), updated_at = now()
 WHERE membership.id IN (SELECT id FROM approved_memberships);
COMMIT;
