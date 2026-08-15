BEGIN;

-- Fail with a useful diagnostic before replacing the procedural tenant guard.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM miclub.activities a
    LEFT JOIN miclub.sectors s ON (s.id, s.club_id) = (a.sector_id, a.club_id)
    WHERE s.id IS NULL
  ) THEN
    RAISE EXCEPTION 'activities contains sector references outside its tenant';
  END IF;
  IF EXISTS (
    SELECT 1 FROM miclub.activities a
    LEFT JOIN miclub.instructors i ON (i.id, i.club_id) = (a.instructor_id, a.club_id)
    WHERE a.instructor_id IS NOT NULL AND i.id IS NULL
  ) THEN
    RAISE EXCEPTION 'activities contains instructor references outside its tenant';
  END IF;
  IF EXISTS (
    SELECT 1 FROM miclub.activities a
    LEFT JOIN miclub.people p ON (p.id, p.club_id) = (a.manager_person_id, a.club_id)
    WHERE a.manager_person_id IS NOT NULL AND p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'activities contains manager references outside its tenant';
  END IF;
END $$;

-- Although id is already globally unique, these keys are the declared tenant
-- identities required as targets of the composite foreign keys below.
ALTER TABLE miclub.sectors
  ADD CONSTRAINT sectors_id_club_id_key UNIQUE (id, club_id);
ALTER TABLE miclub.instructors
  ADD CONSTRAINT instructors_id_club_id_key UNIQUE (id, club_id);
ALTER TABLE miclub.people
  ADD CONSTRAINT people_id_club_id_key UNIQUE (id, club_id);

ALTER TABLE miclub.activities
  DROP CONSTRAINT IF EXISTS activities_sector_id_fkey,
  DROP CONSTRAINT IF EXISTS activities_instructor_id_fkey,
  DROP CONSTRAINT IF EXISTS activities_manager_person_id_fkey;

ALTER TABLE miclub.activities
  ADD CONSTRAINT activities_sector_tenant_fkey
    FOREIGN KEY (sector_id, club_id)
    REFERENCES miclub.sectors (id, club_id) ON DELETE RESTRICT,
  ADD CONSTRAINT activities_instructor_tenant_fkey
    FOREIGN KEY (instructor_id, club_id)
    REFERENCES miclub.instructors (id, club_id) ON DELETE RESTRICT,
  ADD CONSTRAINT activities_manager_person_tenant_fkey
    FOREIGN KEY (manager_person_id, club_id)
    REFERENCES miclub.people (id, club_id) ON DELETE RESTRICT;

-- Match the exact leading-column order of each FK for parent-side changes and
-- delete checks. The required sector relationship is intentionally unfiltered.
CREATE INDEX activities_sector_club_fkey_idx
  ON miclub.activities (sector_id, club_id);
CREATE INDEX activities_instructor_club_fkey_idx
  ON miclub.activities (instructor_id, club_id)
  WHERE instructor_id IS NOT NULL;
CREATE INDEX activities_manager_person_club_fkey_idx
  ON miclub.activities (manager_person_id, club_id)
  WHERE manager_person_id IS NOT NULL;

-- Tenant membership is now enforced atomically by the three composite FKs.
DROP TRIGGER IF EXISTS activities_validate_tenant ON miclub.activities;
DROP FUNCTION IF EXISTS miclub.validate_activity_tenant();

COMMENT ON CONSTRAINT activities_sector_tenant_fkey ON miclub.activities IS
  'Tenant-scoped sector reference. Referenced sectors must be archived instead of deleted.';
COMMENT ON CONSTRAINT activities_instructor_tenant_fkey ON miclub.activities IS
  'Tenant-scoped canonical instructor reference; deletion is restricted while activities refer to it.';
COMMENT ON CONSTRAINT activities_manager_person_tenant_fkey ON miclub.activities IS
  'Tenant-scoped legacy manager reference; deletion is restricted until the relationship is retired.';

COMMIT;
