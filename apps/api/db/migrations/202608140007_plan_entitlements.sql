-- Billing catalog is global; only the selected subscription belongs to a tenant.
CREATE TABLE miclub.features (
  code text PRIMARY KEY CHECK (code = upper(code) AND btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE miclub.plans (
  code text PRIMARY KEY CHECK (code = upper(code) AND btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  catalog_status text NOT NULL CHECK (catalog_status IN ('development', 'catalog', 'inactive')),
  is_development boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((catalog_status = 'development') = is_development)
);

CREATE TABLE miclub.plan_entitlements (
  plan_code text NOT NULL REFERENCES miclub.plans(code) ON DELETE CASCADE,
  feature_code text NOT NULL REFERENCES miclub.features(code) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_code, feature_code)
);

CREATE TABLE miclub.club_subscriptions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id uuid NOT NULL REFERENCES miclub.clubs(id) ON DELETE CASCADE,
  plan_code text NOT NULL REFERENCES miclub.plans(code),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until > effective_from)
);

CREATE INDEX club_subscriptions_effective_idx
  ON miclub.club_subscriptions (club_id, effective_from, effective_until);

-- Convert the original one-row-per-capability grants into append-only, expiring
-- override events. Billing remains represented exclusively by subscriptions.
ALTER TABLE miclub.club_capabilities DROP CONSTRAINT club_capabilities_pkey;
ALTER TABLE miclub.club_capabilities
  ADD COLUMN id bigint GENERATED ALWAYS AS IDENTITY,
  ADD COLUMN enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN legacy_permanent boolean NOT NULL DEFAULT true,
  ADD COLUMN reason text NOT NULL DEFAULT 'legacy capability grant' CHECK (btrim(reason) <> ''),
  ADD CONSTRAINT club_capabilities_pkey PRIMARY KEY (id),
  ADD CONSTRAINT club_capabilities_new_overrides_expire
    CHECK (legacy_permanent OR effective_until IS NOT NULL);
ALTER TABLE miclub.club_capabilities ALTER COLUMN legacy_permanent SET DEFAULT false;

COMMENT ON TABLE miclub.club_capabilities IS
  'Append-only, auditable and temporary feature overrides; never a billing or subscription record.';
COMMENT ON COLUMN miclub.club_capabilities.effective_until IS
  'Override expiry. New overrides must be temporary; legacy NULL grants remain compatible during rollout.';

INSERT INTO miclub.features (code, name, description) VALUES
  ('DATA_MIGRATION', 'Migración de datos', 'Importación inicial y migraciones operativas seguras');

INSERT INTO miclub.plans (code, name, catalog_status, is_development) VALUES
  ('DEVELOPMENT', 'Desarrollo', 'development', true),
  ('STARTER', 'Starter', 'catalog', false),
  ('GROWTH', 'Growth', 'catalog', false),
  ('PROFESSIONAL', 'Professional', 'inactive', false),
  ('ENTERPRISE', 'Enterprise', 'inactive', false);

-- Development always receives the complete current catalog without special
-- application code; adding a feature requires adding its entitlement here too.
INSERT INTO miclub.plan_entitlements (plan_code, feature_code)
SELECT 'DEVELOPMENT', code FROM miclub.features;
