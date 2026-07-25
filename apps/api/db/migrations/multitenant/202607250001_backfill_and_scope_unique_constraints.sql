-- Phase 2: backfill the legacy tenant, verify club-local duplicates, then scope uniqueness.
BEGIN;

INSERT INTO miclub.clubs (code, name, legal_name)
VALUES ('legacy', 'MiClub', 'MiClub (datos anteriores a multitenencia)')
ON CONFLICT (lower(code)) WHERE code IS NOT NULL DO NOTHING;

DO $$
DECLARE
  legacy_club_id uuid;
  table_name text;
  null_count bigint;
BEGIN
  SELECT id INTO STRICT legacy_club_id FROM miclub.clubs WHERE lower(code) = 'legacy';

  -- These tables were all tenant-scoped in phase 1. Existing data came from the
  -- single-club dump, so assigning the legacy club is the deterministic backfill.
  FOREACH table_name IN ARRAY ARRAY[
    'people', 'person_kind_links', 'sectors', 'instructors', 'activities',
    'movement_categories', 'payment_methods', 'discount_rates', 'roles',
    'salon_hour_prices', 'enrollments', 'movements', 'payments', 'receivables',
    'payment_allocations', 'import_batches', 'import_errors', 'operational_balances',
    'sheet_metric_snapshots', 'enrollment_fee_audit', 'activity_fee_history',
    'activity_fee_cleanup_candidates'
  ] LOOP
    IF to_regclass(format('miclub.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('UPDATE miclub.%I SET club_id = $1 WHERE club_id IS NULL', table_name)
        USING legacy_club_id;
      EXECUTE format('SELECT count(*) FROM miclub.%I WHERE club_id IS NULL', table_name)
        INTO null_count;
      IF null_count <> 0 THEN
        RAISE EXCEPTION 'Backfill failed: miclub.% still has % rows without club_id', table_name, null_count;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO miclub.club_memberships (club_id, person_id, status, joined_at)
  SELECT p.club_id, p.id, 'active', p.created_at
  FROM miclub.people p
  ON CONFLICT (club_id, person_id) DO NOTHING;

  UPDATE miclub.club_memberships cm
  SET club_id = p.club_id
  FROM miclub.people p
  WHERE cm.person_id = p.id AND cm.club_id IS NULL;
END $$;

-- Fail before dropping a single old constraint if any future key is duplicated.
CREATE OR REPLACE FUNCTION pg_temp.assert_club_unique(
  relation regclass, key_sql text, predicate_sql text DEFAULT 'true'
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE duplicate_description text;
BEGIN
  EXECUTE format(
    'SELECT concat_ws('' | '', club_id::text, %s) FROM %s WHERE %s GROUP BY club_id, %s HAVING count(*) > 1 LIMIT 1',
    key_sql, relation, predicate_sql, key_sql
  ) INTO duplicate_description;
  IF duplicate_description IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate club-local key in %: %', relation, duplicate_description;
  END IF;
END $$;

SELECT pg_temp.assert_club_unique('miclub.people', 'dni', 'dni IS NOT NULL');
SELECT pg_temp.assert_club_unique('miclub.person_kind_links', 'person_id, kind');
SELECT pg_temp.assert_club_unique('miclub.sectors', 'lower(code)', 'code IS NOT NULL');
SELECT pg_temp.assert_club_unique('miclub.sectors', 'lower(name)', 'name IS NOT NULL');
SELECT pg_temp.assert_club_unique('miclub.instructors', 'person_id', 'person_id IS NOT NULL');
SELECT pg_temp.assert_club_unique('miclub.activities', 'sector_id, lower(name), coalesce(lower(modality), '''')');
SELECT pg_temp.assert_club_unique('miclub.movement_categories', 'upper(trim(name))');
SELECT pg_temp.assert_club_unique('miclub.payment_methods', 'lower(name)');
SELECT pg_temp.assert_club_unique('miclub.discount_rates', 'percent');
SELECT pg_temp.assert_club_unique('miclub.roles', 'lower(code)');
SELECT pg_temp.assert_club_unique('miclub.salon_hour_prices', 'hours');
SELECT pg_temp.assert_club_unique('miclub.enrollments', 'external_id', 'external_id IS NOT NULL');
SELECT pg_temp.assert_club_unique('miclub.movements', 'external_id', 'external_id IS NOT NULL');
SELECT pg_temp.assert_club_unique('miclub.payment_allocations', 'payment_id, receivable_id');
SELECT pg_temp.assert_club_unique('miclub.operational_balances', 'source, cutoff_date');
SELECT pg_temp.assert_club_unique('miclub.sheet_metric_snapshots', 'metric_key, captured_at');

-- Validate columns that only exist in installations created from the older
-- bootstrap migration too. This still happens before any old key is removed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='miclub' AND table_name='instructors' AND column_name='code') THEN
    PERFORM pg_temp.assert_club_unique('miclub.instructors', 'lower(code)', 'code IS NOT NULL');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='miclub' AND table_name='activities' AND column_name='code') THEN
    PERFORM pg_temp.assert_club_unique('miclub.activities', 'lower(code)', 'code IS NOT NULL');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='miclub' AND table_name='movement_categories' AND column_name='code') THEN
    PERFORM pg_temp.assert_club_unique('miclub.movement_categories', 'lower(code)', 'code IS NOT NULL');
  END IF;
END $$;

-- Constraint-backed uniqueness must be removed with ALTER TABLE; standalone
-- indexes are removed afterwards. All statements occur only after the assertions.
ALTER TABLE miclub.people DROP CONSTRAINT IF EXISTS people_dni_key;
ALTER TABLE miclub.person_kind_links DROP CONSTRAINT IF EXISTS person_kind_links_pkey;
ALTER TABLE miclub.sectors DROP CONSTRAINT IF EXISTS sectors_code_key;
ALTER TABLE miclub.sectors DROP CONSTRAINT IF EXISTS sectors_name_key;
ALTER TABLE miclub.instructors DROP CONSTRAINT IF EXISTS instructors_person_id_key;
ALTER TABLE miclub.instructors DROP CONSTRAINT IF EXISTS instructors_code_key;
ALTER TABLE miclub.activities DROP CONSTRAINT IF EXISTS activities_code_key;
ALTER TABLE miclub.movement_categories DROP CONSTRAINT IF EXISTS movement_categories_name_key;
ALTER TABLE miclub.movement_categories DROP CONSTRAINT IF EXISTS movement_categories_code_key;
ALTER TABLE miclub.payment_methods DROP CONSTRAINT IF EXISTS payment_methods_name_key;
ALTER TABLE miclub.discount_rates DROP CONSTRAINT IF EXISTS discount_rates_percent_key;
ALTER TABLE miclub.roles DROP CONSTRAINT IF EXISTS roles_code_key;
ALTER TABLE miclub.salon_hour_prices DROP CONSTRAINT IF EXISTS salon_hour_prices_hours_key;
ALTER TABLE miclub.enrollments DROP CONSTRAINT IF EXISTS enrollments_external_id_key;
ALTER TABLE miclub.movements DROP CONSTRAINT IF EXISTS movements_external_id_key;
ALTER TABLE miclub.payment_allocations DROP CONSTRAINT IF EXISTS payment_allocations_payment_id_receivable_id_key;
ALTER TABLE miclub.operational_balances DROP CONSTRAINT IF EXISTS operational_balances_source_cutoff_date_key;
ALTER TABLE miclub.sheet_metric_snapshots DROP CONSTRAINT IF EXISTS sheet_metric_snapshots_pkey;

DROP INDEX IF EXISTS miclub.people_dni_unique_not_null;
DROP INDEX IF EXISTS miclub.person_kind_links_person_id_kind_key;
DROP INDEX IF EXISTS miclub.sectors_lower_code_key;
DROP INDEX IF EXISTS miclub.sectors_lower_name_key;
DROP INDEX IF EXISTS miclub.activities_sector_name_modality_key;
DROP INDEX IF EXISTS miclub.ux_activities_sector_name_modality;
DROP INDEX IF EXISTS miclub.movement_categories_lower_name_key;
DROP INDEX IF EXISTS miclub.ux_movement_categories_name_neutral;
DROP INDEX IF EXISTS miclub.operational_balances_source_cutoff_date_key;

CREATE UNIQUE INDEX people_club_dni_key ON miclub.people (club_id, dni) WHERE dni IS NOT NULL;
ALTER TABLE miclub.person_kind_links
  ADD CONSTRAINT person_kind_links_pkey PRIMARY KEY (club_id, person_id, kind);
CREATE UNIQUE INDEX sectors_club_code_key ON miclub.sectors (club_id, lower(code)) WHERE code IS NOT NULL;
CREATE UNIQUE INDEX sectors_club_normalized_name_key ON miclub.sectors (club_id, lower(name));
CREATE UNIQUE INDEX instructors_club_person_key ON miclub.instructors (club_id, person_id) WHERE person_id IS NOT NULL;
CREATE UNIQUE INDEX activities_club_sector_normalized_name_modality_key
  ON miclub.activities (club_id, sector_id, lower(name), coalesce(lower(modality), ''));
CREATE UNIQUE INDEX movement_categories_club_normalized_name_key
  ON miclub.movement_categories (club_id, upper(trim(name)));
CREATE UNIQUE INDEX payment_methods_club_normalized_name_key ON miclub.payment_methods (club_id, lower(name));
CREATE UNIQUE INDEX discount_rates_club_percent_key ON miclub.discount_rates (club_id, percent);
CREATE UNIQUE INDEX roles_club_code_key ON miclub.roles (club_id, lower(code));
CREATE UNIQUE INDEX salon_hour_prices_club_hours_key ON miclub.salon_hour_prices (club_id, hours);
CREATE UNIQUE INDEX enrollments_club_external_id_key ON miclub.enrollments (club_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX movements_club_external_id_key ON miclub.movements (club_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX payment_allocations_club_payment_receivable_key
  ON miclub.payment_allocations (club_id, payment_id, receivable_id);
CREATE UNIQUE INDEX operational_balances_club_source_cutoff_key
  ON miclub.operational_balances (club_id, source, cutoff_date);
ALTER TABLE miclub.sheet_metric_snapshots
  ADD CONSTRAINT sheet_metric_snapshots_pkey PRIMARY KEY (club_id, metric_key, captured_at);

-- Columns present only in some historical installations are handled explicitly.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='miclub' AND table_name='instructors' AND column_name='code') THEN
    EXECUTE 'CREATE UNIQUE INDEX instructors_club_code_key ON miclub.instructors (club_id, lower(code)) WHERE code IS NOT NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='miclub' AND table_name='activities' AND column_name='code') THEN
    EXECUTE 'CREATE UNIQUE INDEX activities_club_code_key ON miclub.activities (club_id, lower(code)) WHERE code IS NOT NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='miclub' AND table_name='movement_categories' AND column_name='code') THEN
    EXECUTE 'CREATE UNIQUE INDEX movement_categories_club_code_key ON miclub.movement_categories (club_id, lower(code)) WHERE code IS NOT NULL';
  END IF;
END $$;

ALTER TABLE miclub.club_memberships ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE miclub.club_memberships ALTER COLUMN person_id SET NOT NULL;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'people', 'person_kind_links', 'sectors', 'instructors', 'activities',
    'movement_categories', 'payment_methods', 'discount_rates', 'roles',
    'salon_hour_prices', 'enrollments', 'movements', 'payments', 'receivables',
    'payment_allocations', 'import_batches', 'import_errors', 'operational_balances',
    'sheet_metric_snapshots', 'enrollment_fee_audit', 'activity_fee_history',
    'activity_fee_cleanup_candidates'
  ] LOOP
    IF to_regclass(format('miclub.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE miclub.%I ALTER COLUMN club_id SET NOT NULL', table_name);
    END IF;
  END LOOP;
END $$;

COMMIT;
