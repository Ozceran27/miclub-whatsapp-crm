-- Commercial taxonomy only. This script is safe to retry manually in DBeaver
-- after a previous partial execution. It does not create prices or collect payments.
ALTER TABLE miclub.plans
  ADD COLUMN IF NOT EXISTS commercial_class text;

-- Preserve the original STARTER identity as the free tier. If an earlier attempt
-- already renamed it, FREE is simply normalized below.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM miclub.plans WHERE code = 'STARTER')
     AND NOT EXISTS (SELECT 1 FROM miclub.plans WHERE code = 'FREE') THEN
    UPDATE miclub.plans SET code = 'FREE' WHERE code = 'STARTER';
  END IF;
END $$;

-- Restore/normalize the exact public catalog. ENTERPRISE is the third paid tier;
-- deleting it was the cause of the previous 1-free/2-paid assertion failure.
INSERT INTO miclub.plans (code, name, catalog_status, is_development, commercial_class)
VALUES
  ('FREE', 'Free', 'catalog', false, 'free'),
  ('GROWTH', 'Growth', 'catalog', false, 'paid'),
  ('PROFESSIONAL', 'Professional', 'catalog', false, 'paid'),
  ('ENTERPRISE', 'Enterprise', 'catalog', false, 'paid')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  catalog_status = EXCLUDED.catalog_status,
  is_development = EXCLUDED.is_development,
  commercial_class = EXCLUDED.commercial_class;

UPDATE miclub.plans
   SET catalog_status = 'development', is_development = true,
       commercial_class = 'non_commercial'
 WHERE code = 'DEVELOPMENT';

-- Any legacy or future plan not explicitly listed remains stored but is not part
-- of this commercial catalog. catalog_status is lifecycle, never a price proxy.
UPDATE miclub.plans
   SET catalog_status = 'inactive', is_development = false,
       commercial_class = 'paid'
 WHERE code NOT IN ('DEVELOPMENT', 'FREE', 'GROWTH', 'PROFESSIONAL', 'ENTERPRISE');

ALTER TABLE miclub.plans
  DROP CONSTRAINT IF EXISTS plans_commercial_class_check,
  DROP CONSTRAINT IF EXISTS plans_development_non_commercial_check;

ALTER TABLE miclub.plans
  ALTER COLUMN commercial_class SET NOT NULL,
  ADD CONSTRAINT plans_commercial_class_check
    CHECK (commercial_class IN ('non_commercial', 'free', 'paid')),
  ADD CONSTRAINT plans_development_non_commercial_check
    CHECK ((code = 'DEVELOPMENT' AND is_development AND catalog_status = 'development'
            AND commercial_class = 'non_commercial')
        OR (code <> 'DEVELOPMENT' AND NOT is_development
            AND catalog_status <> 'development' AND commercial_class <> 'non_commercial'));

DROP INDEX IF EXISTS miclub.plans_one_free_commercial_plan_idx;
CREATE UNIQUE INDEX plans_one_free_commercial_plan_idx
  ON miclub.plans (commercial_class)
  WHERE commercial_class = 'free';

COMMENT ON COLUMN miclub.plans.commercial_class IS
  'Explicit future pricing class; independent from catalog_status. Does not implement prices or payment collection.';
COMMENT ON COLUMN miclub.plans.is_development IS
  'True only for DEVELOPMENT, an internal testing plan excluded from the commercial catalog and forbidden in production provisioning.';

-- Fail with useful diagnostics if pre-existing data still prevents the contract.
DO $$
DECLARE
  free_count integer;
  paid_count integer;
BEGIN
  SELECT count(*) INTO free_count
    FROM miclub.plans
   WHERE catalog_status = 'catalog' AND commercial_class = 'free';
  SELECT count(*) INTO paid_count
    FROM miclub.plans
   WHERE catalog_status = 'catalog' AND commercial_class = 'paid';

  IF free_count <> 1 OR paid_count <> 3
     OR EXISTS (SELECT 1 FROM miclub.plans WHERE code = 'DEVELOPMENT' AND catalog_status = 'catalog') THEN
    RAISE EXCEPTION
      'Invalid commercial catalog: expected 1 free and 3 paid plans, found % free and % paid; DEVELOPMENT must be excluded',
      free_count, paid_count;
  END IF;
END $$;
