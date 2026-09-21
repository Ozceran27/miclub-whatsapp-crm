BEGIN;

-- Canonical labour role. Membership controls access; position records the
-- employee's operational role even when no account is linked.
UPDATE miclub.employees e
SET position = CASE
  WHEN upper(trim(coalesce(r.code, e.position, ''))) IN ('DIRECTOR','INSTRUCTOR','TRABAJADOR')
    THEN upper(trim(coalesce(r.code, e.position)))
  ELSE 'TRABAJADOR'
END,
updated_at = now()
FROM miclub.user_club_memberships m
LEFT JOIN miclub.roles r ON r.id=m.role_id AND r.club_id=m.club_id
WHERE m.id=e.membership_id;

UPDATE miclub.employees
SET position = CASE WHEN upper(trim(coalesce(position,''))) IN ('DIRECTOR','INSTRUCTOR','TRABAJADOR')
  THEN upper(trim(position)) ELSE 'TRABAJADOR' END,
  updated_at=now()
WHERE membership_id IS NULL OR position IS NULL OR position<>upper(trim(position))
   OR upper(trim(position)) NOT IN ('DIRECTOR','INSTRUCTOR','TRABAJADOR');

ALTER TABLE miclub.employees DROP CONSTRAINT IF EXISTS employees_position_role_check;
ALTER TABLE miclub.employees ADD CONSTRAINT employees_position_role_check
  CHECK(position IN ('DIRECTOR','INSTRUCTOR','TRABAJADOR'));
ALTER TABLE miclub.employees ALTER COLUMN position SET NOT NULL;

-- Replace the single-column sector FK with a tenant-scoped relationship.
ALTER TABLE miclub.employees DROP CONSTRAINT IF EXISTS employees_sector_id_fkey;
ALTER TABLE miclub.employees DROP CONSTRAINT IF EXISTS employees_sector_tenant_fkey;
ALTER TABLE miclub.employees ADD CONSTRAINT employees_sector_tenant_fkey
  FOREIGN KEY(sector_id,club_id) REFERENCES miclub.sectors(id,club_id) ON DELETE RESTRICT;

ALTER TABLE miclub.activities ADD COLUMN IF NOT EXISTS responsible_employee_id uuid;

-- Backfill the operational owner through the historical Instructor relation.
DO $$
DECLARE ambiguous integer;
BEGIN
  SELECT count(*) INTO ambiguous
  FROM (
    SELECT a.id
    FROM miclub.activities a
    LEFT JOIN miclub.instructors i ON i.id=a.instructor_id AND i.club_id=a.club_id
    LEFT JOIN miclub.employees e ON e.club_id=a.club_id AND e.person_id=i.person_id AND e.archived_at IS NULL
    WHERE a.archived_at IS NULL AND a.responsible_employee_id IS NULL
    GROUP BY a.id
    HAVING count(e.id)<>1
  ) unresolved;
  IF ambiguous>0 THEN
    RAISE EXCEPTION 'ACTIVITY_RESPONSIBLE_BACKFILL_AMBIGUOUS: % active activities do not map to exactly one employee',ambiguous;
  END IF;
END $$;

UPDATE miclub.activities a
SET responsible_employee_id=e.id
FROM miclub.instructors i
JOIN miclub.employees e ON e.club_id=i.club_id AND e.person_id=i.person_id AND e.archived_at IS NULL
WHERE a.club_id=i.club_id AND a.instructor_id=i.id AND a.responsible_employee_id IS NULL;

DO $$
DECLARE unresolved integer;
BEGIN
  SELECT count(*) INTO unresolved FROM miclub.activities
  WHERE archived_at IS NULL AND responsible_employee_id IS NULL;
  IF unresolved>0 THEN
    RAISE EXCEPTION 'ACTIVITY_RESPONSIBLE_BACKFILL_REQUIRED: % active activities could not be mapped to one employee',unresolved;
  END IF;
END $$;

ALTER TABLE miclub.activities DROP CONSTRAINT IF EXISTS activities_responsible_employee_tenant_fkey;
ALTER TABLE miclub.activities ADD CONSTRAINT activities_responsible_employee_tenant_fkey
  FOREIGN KEY(responsible_employee_id,club_id) REFERENCES miclub.employees(id,club_id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS activities_responsible_employee_idx
  ON miclub.activities(club_id,responsible_employee_id) WHERE archived_at IS NULL;

ALTER TABLE miclub.activities DROP CONSTRAINT IF EXISTS activities_new_writes_require_instructor;
DROP TRIGGER IF EXISTS activities_require_instructor ON miclub.activities;
ALTER TABLE miclub.activities ALTER COLUMN instructor_id DROP NOT NULL;
ALTER TABLE miclub.activities DROP CONSTRAINT IF EXISTS activities_new_writes_require_responsible_employee;
ALTER TABLE miclub.activities ADD CONSTRAINT activities_new_writes_require_responsible_employee
  CHECK(archived_at IS NOT NULL OR responsible_employee_id IS NOT NULL) NOT VALID;
ALTER TABLE miclub.activities VALIDATE CONSTRAINT activities_new_writes_require_responsible_employee;

COMMENT ON COLUMN miclub.activities.responsible_employee_id IS
  'Canonical tenant-scoped operational responsible. Any active employee role is valid.';
COMMENT ON COLUMN miclub.activities.instructor_id IS
  'Legacy optional Instructor relation retained for compatibility; not the operational responsibility authority.';

COMMIT;
