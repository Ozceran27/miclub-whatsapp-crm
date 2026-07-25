-- Phase 1 multitenant migration: create the clubs catalog without backfilling or enforcing tenant ownership.
-- Rollback for this file:
--   BEGIN;
--   DROP TABLE IF EXISTS miclub.clubs;
--   COMMIT;

BEGIN;

CREATE SCHEMA IF NOT EXISTS miclub;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Pre-migration diagnostics -------------------------------------------------
SELECT
  'pre_202607240001_create_clubs' AS diagnostic,
  to_regclass('miclub.clubs') IS NOT NULL AS clubs_table_exists,
  COUNT(*) FILTER (WHERE table_schema = 'miclub') AS miclub_table_count
FROM information_schema.tables
WHERE table_schema = 'miclub';

CREATE TABLE IF NOT EXISTS miclub.clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  name text,
  legal_name text,
  tax_id text,
  email text,
  phone text,
  address text,
  timezone text,
  settings jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS clubs_code_unique_not_null
  ON miclub.clubs (lower(code))
  WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS clubs_active_name_idx
  ON miclub.clubs (is_active, lower(name));

COMMENT ON TABLE miclub.clubs IS
  'Club tenants available in the MiClub schema. Phase 1 only creates the catalog; existing rows in other tables may keep club_id null.';
COMMENT ON COLUMN miclub.clubs.code IS 'Optional stable tenant code used by imports, integrations, or routing.';
COMMENT ON COLUMN miclub.clubs.settings IS 'Tenant-specific configuration reserved for future phases.';

-- Post-migration validations ------------------------------------------------
DO $$
BEGIN
  IF to_regclass('miclub.clubs') IS NULL THEN
    RAISE EXCEPTION 'Validation failed: miclub.clubs was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'miclub'
      AND indexname = 'clubs_code_unique_not_null'
  ) THEN
    RAISE EXCEPTION 'Validation failed: clubs_code_unique_not_null index is missing';
  END IF;
END $$;

SELECT
  'post_202607240001_create_clubs' AS validation,
  COUNT(*) AS clubs_count
FROM miclub.clubs;

COMMIT;
