-- The commercial taxonomy is informational until billing is implemented.
-- Preserve historical/future gateway origins while explicitly validating the
-- current onboarding activation source.
ALTER TABLE miclub.club_subscriptions
  DROP CONSTRAINT IF EXISTS club_subscriptions_selection_source_check;
ALTER TABLE miclub.club_subscriptions
  ADD CONSTRAINT club_subscriptions_selection_source_check
  CHECK (selection_source IN (
    'legacy',
    'free',
    'sandbox_onboarding',
    'future_gateway',
    'authenticated_gateway_confirmation',
    'pre_billing_onboarding'
  ));

COMMENT ON COLUMN miclub.club_subscriptions.selection_source IS
  'Auditable origin. pre_billing_onboarding activates any commercial plan without collecting payment; gateway values are reserved for future billing.';
