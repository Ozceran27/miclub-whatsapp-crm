-- Phase 1 multitenant migration: add nullable club_id columns to tenant-scoped tables.
-- No NOT NULL constraints, backfills, unique-index rewrites, or destructive changes are applied here.
-- Rollback for this file:
--   BEGIN;
--   ALTER TABLE IF EXISTS miclub.activity_fee_cleanup_candidates DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.activity_fee_history DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.enrollment_fee_audit DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.sheet_metric_snapshots DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.operational_balances DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.import_errors DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.import_batches DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.payment_allocations DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.receivables DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.payments DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.movements DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.enrollments DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.salon_hour_prices DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.roles DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.discount_rates DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.payment_methods DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.movement_categories DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.activities DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.instructors DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.sectors DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.person_kind_links DROP COLUMN IF EXISTS club_id;
--   ALTER TABLE IF EXISTS miclub.people DROP COLUMN IF EXISTS club_id;
--   COMMIT;

BEGIN;

-- Pre-migration diagnostics -------------------------------------------------
WITH target_tables(table_name) AS (
  VALUES
    ('people'), ('person_kind_links'), ('sectors'), ('instructors'), ('activities'),
    ('movement_categories'), ('payment_methods'), ('discount_rates'), ('roles'),
    ('salon_hour_prices'), ('enrollments'), ('movements'), ('payments'),
    ('receivables'), ('payment_allocations'), ('import_batches'), ('import_errors'),
    ('operational_balances'), ('sheet_metric_snapshots'), ('enrollment_fee_audit'),
    ('activity_fee_history'), ('activity_fee_cleanup_candidates')
)
SELECT
  'pre_202607240003_add_nullable_club_id' AS diagnostic,
  t.table_name,
  to_regclass(format('miclub.%I', t.table_name)) IS NOT NULL AS table_exists,
  EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'miclub'
      AND c.table_name = t.table_name
      AND c.column_name = 'club_id'
  ) AS club_id_exists
FROM target_tables t
ORDER BY t.table_name;

ALTER TABLE IF EXISTS miclub.people ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.person_kind_links ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.sectors ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.instructors ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.activities ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.movement_categories ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.payment_methods ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.discount_rates ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.roles ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.salon_hour_prices ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.enrollments ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.movements ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.payments ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.receivables ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.payment_allocations ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.import_batches ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.import_errors ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.operational_balances ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.sheet_metric_snapshots ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.enrollment_fee_audit ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.activity_fee_history ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);
ALTER TABLE IF EXISTS miclub.activity_fee_cleanup_candidates ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id);

CREATE INDEX IF NOT EXISTS people_club_id_idx ON miclub.people (club_id);
CREATE INDEX IF NOT EXISTS sectors_club_id_idx ON miclub.sectors (club_id);
CREATE INDEX IF NOT EXISTS activities_club_id_idx ON miclub.activities (club_id);
CREATE INDEX IF NOT EXISTS enrollments_club_id_idx ON miclub.enrollments (club_id);
CREATE INDEX IF NOT EXISTS movements_club_id_idx ON miclub.movements (club_id);
CREATE INDEX IF NOT EXISTS payments_club_id_idx ON miclub.payments (club_id);
CREATE INDEX IF NOT EXISTS receivables_club_id_idx ON miclub.receivables (club_id);
CREATE INDEX IF NOT EXISTS import_batches_club_id_idx ON miclub.import_batches (club_id);

COMMENT ON COLUMN miclub.people.club_id IS 'Nullable tenant owner introduced for multitenant phase 1; not enforced until backfill is complete.';
COMMENT ON COLUMN miclub.sectors.club_id IS 'Nullable tenant owner introduced for multitenant phase 1; not enforced until backfill is complete.';
COMMENT ON COLUMN miclub.activities.club_id IS 'Nullable tenant owner introduced for multitenant phase 1; not enforced until backfill is complete.';
COMMENT ON COLUMN miclub.enrollments.club_id IS 'Nullable tenant owner introduced for multitenant phase 1; not enforced until backfill is complete.';
COMMENT ON COLUMN miclub.movements.club_id IS 'Nullable tenant owner introduced for multitenant phase 1; not enforced until backfill is complete.';

-- Post-migration validations ------------------------------------------------
DO $$
DECLARE
  missing_columns text;
  non_nullable_columns text;
BEGIN
  WITH target_tables(table_name) AS (
    VALUES
      ('people'), ('person_kind_links'), ('sectors'), ('instructors'), ('activities'),
      ('movement_categories'), ('payment_methods'), ('discount_rates'), ('roles'),
      ('salon_hour_prices'), ('enrollments'), ('movements'), ('payments'),
      ('receivables'), ('payment_allocations'), ('import_batches'), ('import_errors'),
      ('operational_balances'), ('sheet_metric_snapshots'), ('enrollment_fee_audit'),
      ('activity_fee_history'), ('activity_fee_cleanup_candidates')
  )
  SELECT string_agg(t.table_name, ', ' ORDER BY t.table_name)
  INTO missing_columns
  FROM target_tables t
  WHERE to_regclass(format('miclub.%I', t.table_name)) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'miclub'
        AND c.table_name = t.table_name
        AND c.column_name = 'club_id'
    );

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Validation failed: missing club_id on %', missing_columns;
  END IF;

  SELECT string_agg(format('%I.%I', c.table_name, c.column_name), ', ' ORDER BY c.table_name)
  INTO non_nullable_columns
  FROM information_schema.columns c
  WHERE c.table_schema = 'miclub'
    AND c.column_name = 'club_id'
    AND c.is_nullable <> 'YES';

  IF non_nullable_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Validation failed: club_id must remain nullable in phase 1: %', non_nullable_columns;
  END IF;
END $$;

WITH target_tables(table_name) AS (
  VALUES
    ('people'), ('person_kind_links'), ('sectors'), ('instructors'), ('activities'),
    ('movement_categories'), ('payment_methods'), ('discount_rates'), ('roles'),
    ('salon_hour_prices'), ('enrollments'), ('movements'), ('payments'),
    ('receivables'), ('payment_allocations'), ('import_batches'), ('import_errors'),
    ('operational_balances'), ('sheet_metric_snapshots'), ('enrollment_fee_audit'),
    ('activity_fee_history'), ('activity_fee_cleanup_candidates')
)
SELECT
  'post_202607240003_add_nullable_club_id' AS validation,
  t.table_name,
  c.is_nullable,
  c.data_type
FROM target_tables t
JOIN information_schema.columns c
  ON c.table_schema = 'miclub'
 AND c.table_name = t.table_name
 AND c.column_name = 'club_id'
ORDER BY t.table_name;

COMMIT;
