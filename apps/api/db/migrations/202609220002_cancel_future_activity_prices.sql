-- Logical cancellation keeps historical enrollment FKs and price audit intact.
-- Run only after 202609220001_activity_pricing_and_schedules.sql.
BEGIN;

DO $$ BEGIN
  IF to_regclass('miclub.activity_price_terms') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_constraint
       WHERE conrelid='miclub.activity_price_terms'::regclass
         AND conname='activity_price_terms_no_overlap') THEN
    RAISE EXCEPTION 'ACTIVITY_PRICE_TERMS_PREREQUISITES_MISSING';
  END IF;
END $$;

ALTER TABLE miclub.activity_price_terms
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE miclub.activity_price_terms
  DROP CONSTRAINT IF EXISTS activity_price_terms_no_overlap;
ALTER TABLE miclub.activity_price_terms
  ADD CONSTRAINT activity_price_terms_no_overlap EXCLUDE USING gist
    (club_id WITH =, activity_id WITH =,
     daterange(effective_from,coalesce(effective_to + 1,'infinity'::date),'[)') WITH &&)
    WHERE (cancelled_at IS NULL);

COMMENT ON COLUMN miclub.activity_price_terms.cancelled_at IS
  'Cancelled future price term: retained for audit and enrollment snapshots, excluded from active pricing.';

COMMIT;
