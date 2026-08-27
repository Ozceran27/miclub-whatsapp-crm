-- SOCIAL, COMPLEX and CLUB are the canonical persisted codes (not aliases or
-- display names for GROWTH, PROFESSIONAL and ENTERPRISE). This migration moves
-- every FK-backed subscription and entitlement before removing the old codes.
-- It is safe to retry and deliberately contains no price or payment data.
ALTER TABLE miclub.plans ADD COLUMN IF NOT EXISTS commercial_class text;

INSERT INTO miclub.plans (code,name,catalog_status,is_development,commercial_class)
VALUES ('FREE','Free','catalog',false,'free'),
       ('SOCIAL','Social','catalog',false,'paid'),
       ('COMPLEX','Complex','catalog',false,'paid'),
       ('CLUB','Club','catalog',false,'paid')
ON CONFLICT (code) DO UPDATE SET name=excluded.name,catalog_status='catalog',
  is_development=false,commercial_class=excluded.commercial_class;

-- Copy first (so conflicts are harmless), then repoint the FK-backed history.
INSERT INTO miclub.plan_entitlements(plan_code,feature_code)
SELECT mapping.new_code, entitlement.feature_code
FROM miclub.plan_entitlements entitlement
JOIN (VALUES ('STARTER','FREE'),('GROWTH','SOCIAL'),
             ('PROFESSIONAL','COMPLEX'),('ENTERPRISE','CLUB')) mapping(old_code,new_code)
  ON mapping.old_code=entitlement.plan_code
ON CONFLICT DO NOTHING;

UPDATE miclub.club_subscriptions subscription SET plan_code=mapping.new_code
FROM (VALUES ('STARTER','FREE'),('GROWTH','SOCIAL'),
             ('PROFESSIONAL','COMPLEX'),('ENTERPRISE','CLUB')) mapping(old_code,new_code)
WHERE subscription.plan_code=mapping.old_code;

DELETE FROM miclub.plan_entitlements
WHERE plan_code IN ('STARTER','GROWTH','PROFESSIONAL','ENTERPRISE');
DELETE FROM miclub.plans
WHERE code IN ('STARTER','GROWTH','PROFESSIONAL','ENTERPRISE');

-- Every paid onboarding choice enables the migration module. FREE never does.
INSERT INTO miclub.plan_entitlements(plan_code,feature_code)
SELECT plan.code,'DATA_MIGRATION' FROM miclub.plans plan
WHERE plan.code IN ('SOCIAL','COMPLEX','CLUB')
ON CONFLICT DO NOTHING;
DELETE FROM miclub.plan_entitlements
WHERE plan_code='FREE' AND feature_code='DATA_MIGRATION';

UPDATE miclub.plans SET catalog_status='development',is_development=true,
  commercial_class='non_commercial' WHERE code='DEVELOPMENT';
UPDATE miclub.plans SET catalog_status='inactive',is_development=false,
  commercial_class='paid'
WHERE code NOT IN ('DEVELOPMENT','FREE','SOCIAL','COMPLEX','CLUB');

ALTER TABLE miclub.plans DROP CONSTRAINT IF EXISTS plans_commercial_class_check,
  DROP CONSTRAINT IF EXISTS plans_development_non_commercial_check;
ALTER TABLE miclub.plans ALTER COLUMN commercial_class SET NOT NULL,
  ADD CONSTRAINT plans_commercial_class_check CHECK (commercial_class IN ('non_commercial','free','paid')),
  ADD CONSTRAINT plans_development_non_commercial_check CHECK
    ((code='DEVELOPMENT' AND is_development AND catalog_status='development' AND commercial_class='non_commercial')
     OR (code<>'DEVELOPMENT' AND NOT is_development AND catalog_status<>'development' AND commercial_class<>'non_commercial'));
DROP INDEX IF EXISTS miclub.plans_one_free_commercial_plan_idx;
CREATE UNIQUE INDEX plans_one_free_commercial_plan_idx ON miclub.plans(commercial_class)
WHERE commercial_class='free';

ALTER TABLE miclub.club_subscriptions ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'active';
ALTER TABLE miclub.club_subscriptions DROP CONSTRAINT IF EXISTS club_subscriptions_billing_status_check;
ALTER TABLE miclub.club_subscriptions ADD CONSTRAINT club_subscriptions_billing_status_check
  CHECK (billing_status IN ('active','pending_payment','cancelled'));
COMMENT ON COLUMN miclub.club_subscriptions.billing_status IS
  'Billing lifecycle. pending_payment reserves a future checkout without granting entitlements.';

DO $$ BEGIN
 IF (SELECT count(*) FROM miclub.plans WHERE catalog_status='catalog' AND commercial_class='free')<>1
 OR (SELECT count(*) FROM miclub.plans WHERE catalog_status='catalog' AND commercial_class='paid')<>3
 OR EXISTS (SELECT 1 FROM miclub.plans WHERE code IN ('STARTER','GROWTH','PROFESSIONAL','ENTERPRISE'))
 THEN RAISE EXCEPTION 'Invalid canonical commercial catalog'; END IF;
END $$;
