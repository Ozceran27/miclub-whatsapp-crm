-- miClub Gestión - trabajadores y responsables de actividades
-- EJECUCIÓN MANUAL EXCLUSIVA EN DBEAVER. Hacer backup antes de comenzar.
-- El script es transaccional, no borra historia y aborta ante mapeos ambiguos.

BEGIN;

DO $$
BEGIN
  IF current_setting('transaction_read_only')::boolean THEN
    RAISE EXCEPTION 'La conexión es read-only. Use una conexión administrativa controlada.';
  END IF;
  IF to_regclass('miclub.employees') IS NULL OR to_regclass('miclub.activities') IS NULL THEN
    RAISE EXCEPTION 'Esquema incompatible: faltan miclub.employees o miclub.activities.';
  END IF;
END $$;

DO $$
DECLARE ambiguous integer;
BEGIN
  SELECT count(*) INTO ambiguous FROM (
    SELECT a.id
    FROM miclub.activities a
    LEFT JOIN miclub.instructors i ON i.id=a.instructor_id AND i.club_id=a.club_id
    LEFT JOIN miclub.employees e ON e.club_id=a.club_id AND e.person_id=i.person_id AND e.archived_at IS NULL
    WHERE a.archived_at IS NULL AND a.responsible_employee_id IS NULL
    GROUP BY a.id
    HAVING count(e.id)<>1
  ) diagnostic;
  IF ambiguous>0 THEN
    RAISE EXCEPTION 'BACKFILL_AMBIGUO: % actividades vigentes no resuelven exactamente un empleado. Ejecute ROLLBACK y revise la consulta diagnóstica al final.',ambiguous;
  END IF;
END $$;

UPDATE miclub.employees e
SET position=CASE WHEN upper(trim(coalesce(r.code,e.position,''))) IN ('DIRECTOR','INSTRUCTOR','TRABAJADOR') THEN upper(trim(coalesce(r.code,e.position))) ELSE 'TRABAJADOR' END,
    updated_at=now()
FROM miclub.user_club_memberships m
LEFT JOIN miclub.roles r ON r.id=m.role_id AND r.club_id=m.club_id
WHERE m.id=e.membership_id;

UPDATE miclub.employees
SET position=CASE WHEN upper(trim(coalesce(position,''))) IN ('DIRECTOR','INSTRUCTOR','TRABAJADOR') THEN upper(trim(position)) ELSE 'TRABAJADOR' END,
    updated_at=now()
WHERE membership_id IS NULL OR position IS NULL OR position<>upper(trim(position))
   OR upper(trim(position)) NOT IN ('DIRECTOR','INSTRUCTOR','TRABAJADOR');

ALTER TABLE miclub.employees DROP CONSTRAINT IF EXISTS employees_position_role_check;
ALTER TABLE miclub.employees ADD CONSTRAINT employees_position_role_check CHECK(position IN ('DIRECTOR','INSTRUCTOR','TRABAJADOR'));
ALTER TABLE miclub.employees DROP CONSTRAINT IF EXISTS employees_sector_id_fkey;
ALTER TABLE miclub.employees DROP CONSTRAINT IF EXISTS employees_sector_tenant_fkey;
ALTER TABLE miclub.employees ADD CONSTRAINT employees_sector_tenant_fkey
  FOREIGN KEY(sector_id,club_id) REFERENCES miclub.sectors(id,club_id) ON DELETE RESTRICT;

ALTER TABLE miclub.activities ADD COLUMN IF NOT EXISTS responsible_employee_id uuid;
UPDATE miclub.activities a SET responsible_employee_id=e.id
FROM miclub.instructors i
JOIN miclub.employees e ON e.club_id=i.club_id AND e.person_id=i.person_id AND e.archived_at IS NULL
WHERE a.club_id=i.club_id AND a.instructor_id=i.id AND a.responsible_employee_id IS NULL;

ALTER TABLE miclub.activities DROP CONSTRAINT IF EXISTS activities_responsible_employee_tenant_fkey;
ALTER TABLE miclub.activities ADD CONSTRAINT activities_responsible_employee_tenant_fkey
  FOREIGN KEY(responsible_employee_id,club_id) REFERENCES miclub.employees(id,club_id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS activities_responsible_employee_idx ON miclub.activities(club_id,responsible_employee_id) WHERE archived_at IS NULL;
ALTER TABLE miclub.activities DROP CONSTRAINT IF EXISTS activities_new_writes_require_instructor;
DROP TRIGGER IF EXISTS activities_require_instructor ON miclub.activities;
ALTER TABLE miclub.activities ALTER COLUMN instructor_id DROP NOT NULL;
ALTER TABLE miclub.activities DROP CONSTRAINT IF EXISTS activities_new_writes_require_responsible_employee;
ALTER TABLE miclub.activities ADD CONSTRAINT activities_new_writes_require_responsible_employee
  CHECK(archived_at IS NOT NULL OR responsible_employee_id IS NOT NULL) NOT VALID;
ALTER TABLE miclub.activities VALIDATE CONSTRAINT activities_new_writes_require_responsible_employee;

COMMENT ON COLUMN miclub.activities.responsible_employee_id IS 'Canonical tenant-scoped operational responsible. Any active employee role is valid.';
COMMENT ON COLUMN miclub.activities.instructor_id IS 'Legacy optional Instructor relation retained for compatibility; not the operational responsibility authority.';

DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM miclub.activities WHERE archived_at IS NULL AND responsible_employee_id IS NULL) THEN RAISE EXCEPTION 'Post-validación fallida: actividad vigente sin responsable'; END IF;
  IF EXISTS(SELECT 1 FROM miclub.employees e LEFT JOIN miclub.sectors s ON (s.id,s.club_id)=(e.sector_id,e.club_id) WHERE e.sector_id IS NOT NULL AND s.id IS NULL) THEN RAISE EXCEPTION 'Post-validación fallida: sector cross-tenant'; END IF;
  IF EXISTS(SELECT 1 FROM miclub.employees WHERE position NOT IN ('DIRECTOR','INSTRUCTOR','TRABAJADOR')) THEN RAISE EXCEPTION 'Post-validación fallida: rol laboral no canónico'; END IF;
END $$;

COMMIT;

-- DIAGNÓSTICO PREVIO (ejecutar por separado si el bloque aborta):
-- SELECT a.club_id,a.id,a.name,a.instructor_id,i.person_id,count(e.id) employee_matches
-- FROM miclub.activities a LEFT JOIN miclub.instructors i ON (i.id,i.club_id)=(a.instructor_id,a.club_id)
-- LEFT JOIN miclub.employees e ON e.club_id=a.club_id AND e.person_id=i.person_id AND e.archived_at IS NULL
-- WHERE a.archived_at IS NULL GROUP BY a.club_id,a.id,a.name,a.instructor_id,i.person_id HAVING count(e.id)<>1;

-- ROLLBACK DOCUMENTADO (sólo antes de crear responsables no instructores):
-- BEGIN;
-- ALTER TABLE miclub.activities DROP CONSTRAINT IF EXISTS activities_new_writes_require_responsible_employee;
-- ALTER TABLE miclub.activities DROP CONSTRAINT IF EXISTS activities_responsible_employee_tenant_fkey;
-- DROP INDEX IF EXISTS miclub.activities_responsible_employee_idx;
-- ALTER TABLE miclub.activities DROP COLUMN IF EXISTS responsible_employee_id;
-- ALTER TABLE miclub.activities ALTER COLUMN instructor_id SET NOT NULL;
-- ALTER TABLE miclub.employees DROP CONSTRAINT IF EXISTS employees_sector_tenant_fkey;
-- ALTER TABLE miclub.employees DROP CONSTRAINT IF EXISTS employees_position_role_check;
-- ALTER TABLE miclub.employees ADD CONSTRAINT employees_sector_id_fkey FOREIGN KEY(sector_id) REFERENCES miclub.sectors(id) ON DELETE SET NULL;
-- COMMIT;
