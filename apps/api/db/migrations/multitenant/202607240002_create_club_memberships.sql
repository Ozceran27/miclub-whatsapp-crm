-- Phase 1 multitenant migration: create club memberships without changing existing people constraints.
-- Rollback for this file:
--   BEGIN;
--   DROP TABLE IF EXISTS miclub.club_memberships;
--   COMMIT;

BEGIN;

CREATE SCHEMA IF NOT EXISTS miclub;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Pre-migration diagnostics -------------------------------------------------
SELECT
  'pre_202607240002_create_club_memberships' AS diagnostic,
  to_regclass('miclub.clubs') IS NOT NULL AS clubs_table_exists,
  to_regclass('miclub.people') IS NOT NULL AS people_table_exists,
  to_regclass('miclub.club_memberships') IS NOT NULL AS club_memberships_table_exists;

CREATE TABLE IF NOT EXISTS miclub.club_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES miclub.clubs(id),
  person_id uuid REFERENCES miclub.people(id) ON DELETE CASCADE,
  membership_number text,
  status text DEFAULT 'active',
  joined_at timestamptz,
  ended_at timestamptz,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS club_memberships_club_person_key
  ON miclub.club_memberships (club_id, person_id);

CREATE UNIQUE INDEX IF NOT EXISTS club_memberships_number_unique_not_null
  ON miclub.club_memberships (club_id, lower(membership_number))
  WHERE membership_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS club_memberships_person_idx
  ON miclub.club_memberships (person_id);

CREATE INDEX IF NOT EXISTS club_memberships_status_idx
  ON miclub.club_memberships (club_id, status);

COMMENT ON TABLE miclub.club_memberships IS
  'Links people to club tenants. Phase 1 does not backfill memberships or require one for existing tenant-scoped records.';
COMMENT ON COLUMN miclub.club_memberships.membership_number IS 'Optional club-local membership identifier.';

-- Post-migration validations ------------------------------------------------
DO $$
BEGIN
  IF to_regclass('miclub.club_memberships') IS NULL THEN
    RAISE EXCEPTION 'Validation failed: miclub.club_memberships was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'miclub'
      AND table_name = 'club_memberships'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    RAISE EXCEPTION 'Validation failed: club_memberships foreign keys are missing';
  END IF;
END $$;

SELECT
  'post_202607240002_create_club_memberships' AS validation,
  COUNT(*) AS club_memberships_count
FROM miclub.club_memberships;

COMMIT;
