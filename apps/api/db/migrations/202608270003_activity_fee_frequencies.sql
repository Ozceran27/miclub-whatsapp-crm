-- Configurable activity fee periods; additive and backwards-compatible backfill.
ALTER TABLE miclub.activities
  ADD COLUMN IF NOT EXISTS enrollment_fee_frequency text NOT NULL DEFAULT 'MONTHLY'
  CHECK (enrollment_fee_frequency IN ('DAILY','WEEKLY','MONTHLY','YEARLY'));
ALTER TABLE miclub.activity_terms
  ADD COLUMN IF NOT EXISTS fixed_club_fee numeric(14,2),
  ADD COLUMN IF NOT EXISTS fixed_fee_frequency text
  CHECK (fixed_fee_frequency IN ('DAILY','WEEKLY','MONTHLY','YEARLY'));
UPDATE miclub.activity_terms SET fixed_club_fee=monthly_fixed_fee, fixed_fee_frequency='MONTHLY'
WHERE mode='FIXED' AND fixed_club_fee IS NULL;
ALTER TABLE miclub.activity_terms DROP CONSTRAINT IF EXISTS activity_terms_values_check;
ALTER TABLE miclub.activity_terms ADD CONSTRAINT activity_terms_values_check CHECK (
 (mode='VARIABLE' AND club_share_percentage BETWEEN 0 AND 100 AND fixed_club_fee IS NULL AND fixed_fee_frequency IS NULL) OR
 (mode='FIXED' AND fixed_club_fee >= 0 AND fixed_fee_frequency IS NOT NULL AND club_share_percentage IS NULL));
