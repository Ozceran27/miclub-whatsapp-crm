BEGIN;

-- `monthly_fee` predates activity terms. It is an optional historical snapshot of
-- a fee charged to the member and must never be interpreted as club settlement.
-- A later enrollment/pricing flow may replace it with a dedicated model.
ALTER TABLE miclub.activities
  ALTER COLUMN monthly_fee DROP NOT NULL,
  ALTER COLUMN monthly_fee DROP DEFAULT,
  ALTER COLUMN enrollment_fee_frequency DROP NOT NULL,
  ALTER COLUMN enrollment_fee_frequency DROP DEFAULT;

COMMENT ON COLUMN miclub.activities.monthly_fee IS
  'LEGACY nullable: historical member enrollment fee. Not the FIXED settlement amount and not populated by activity/onboarding forms.';
COMMENT ON COLUMN miclub.activities.enrollment_fee_frequency IS
  'LEGACY nullable: frequency associated only with activities.monthly_fee; not a settlement frequency.';

COMMIT;
