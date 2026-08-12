-- ESTABILIZACIÓN MANUAL: este archivo NO forma parte del runner de migraciones.
-- canonical-owner-permissions: ["club:manage","users:manage","imports:run","crm:write","crm:read","people:read","finance:read","dashboard:read","sectors:any","administration.view","administration.configure","sectors.view","sectors.create","sectors.edit","sectors.archive","activities.view","activities.create","activities.edit","activities.archive","workers.view","workers.manage","tasks.view","tasks.create","tasks.edit","tasks.assign","requests.view","requests.approve","requests.reject","movements.view","movements.create","movements.edit","movements.cancel","enrollments.view","enrollments.create","enrollments.edit","enrollments.cancel","finance:write","onboarding.read","onboarding.write"]
-- La prueba permissionCatalog.test.ts compara el marcador anterior con ROLE_DEFAULT_PERMISSIONS.owner.

-- ACTUALIZACIÓN INCREMENTAL MANUAL.
-- Este archivo puede ejecutarse aunque la estabilización original ya se haya
-- aplicado. Solo agrega los dos permisos de onboarding a roles administrativos,
-- conserva permisos personalizados y no concede capacidades a otros roles.
BEGIN;

UPDATE miclub.user_club_memberships AS membership
   SET permissions = array_cat(
         array_remove(
           array_remove(coalesce(membership.permissions, '{}'::text[]), 'onboarding.read'),
           'onboarding.write'
         ),
         ARRAY['onboarding.read', 'onboarding.write']::text[]
       ),
       updated_at = now()
  FROM miclub.roles AS role
 WHERE role.id = membership.role_id
   AND role.club_id = membership.club_id
   AND lower(role.code) IN ('owner', 'admin', 'director')
   AND NOT (
     'onboarding.read' = ANY(coalesce(membership.permissions, '{}'::text[]))
     AND 'onboarding.write' = ANY(coalesce(membership.permissions, '{}'::text[]))
   );

COMMIT;

-- VALIDACIÓN POSTERIOR (solo lectura): debe devolver cero filas.
SELECT membership.id AS membership_id,
       membership.club_id,
       role.code AS role_code,
       membership.permissions
  FROM miclub.user_club_memberships AS membership
  JOIN miclub.roles AS role
    ON role.id = membership.role_id
   AND role.club_id = membership.club_id
 WHERE lower(role.code) IN ('owner', 'admin', 'director')
   AND NOT (
     'onboarding.read' = ANY(coalesce(membership.permissions, '{}'::text[]))
     AND 'onboarding.write' = ANY(coalesce(membership.permissions, '{}'::text[]))
   );
