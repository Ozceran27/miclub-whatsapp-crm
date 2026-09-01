ALTER TABLE miclub.club_subscriptions
  ADD COLUMN IF NOT EXISTS selection_mode text NOT NULL DEFAULT 'disabled',
  ADD COLUMN IF NOT EXISTS selection_source text NOT NULL DEFAULT 'legacy';

ALTER TABLE miclub.club_subscriptions
  DROP CONSTRAINT IF EXISTS club_subscriptions_selection_mode_check;
ALTER TABLE miclub.club_subscriptions
  ADD CONSTRAINT club_subscriptions_selection_mode_check
  CHECK (selection_mode IN ('disabled','sandbox','live'));

-- FREE remains usable, but can never acquire the migration entitlement.
DELETE FROM miclub.plan_entitlements
WHERE plan_code='FREE' AND feature_code='DATA_MIGRATION';

CREATE TABLE IF NOT EXISTS miclub.billing_payment_confirmations (
  gateway_event_id text PRIMARY KEY,
  club_id uuid NOT NULL REFERENCES miclub.clubs(id),
  subscription_id bigint NOT NULL REFERENCES miclub.club_subscriptions(id),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(gateway_event_id) BETWEEN 1 AND 255),
  UNIQUE (club_id,subscription_id,gateway_event_id)
);

ALTER TABLE miclub.billing_payment_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE miclub.billing_payment_confirmations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_payment_confirmations_tenant_isolation ON miclub.billing_payment_confirmations;
CREATE POLICY billing_payment_confirmations_tenant_isolation ON miclub.billing_payment_confirmations
  USING (club_id = NULLIF(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = NULLIF(current_setting('app.club_id', true), '')::uuid);

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='miclub_runtime') THEN
  GRANT SELECT,INSERT ON miclub.billing_payment_confirmations TO miclub_runtime;
  GRANT UPDATE (billing_status,selection_source) ON miclub.club_subscriptions TO miclub_runtime;
 END IF;
END $$;

COMMENT ON COLUMN miclub.club_subscriptions.selection_source IS
  'Auditable origin: free, sandbox_onboarding, future_gateway, or authenticated_gateway_confirmation.';
