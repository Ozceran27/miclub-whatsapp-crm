CREATE TABLE miclub.club_capabilities (
  club_id uuid NOT NULL REFERENCES miclub.clubs(id) ON DELETE CASCADE,
  capability text NOT NULL CHECK (capability IN ('DATA_MIGRATION')),
  source text NOT NULL CHECK (btrim(source) <> ''),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  actor text NOT NULL CHECK (btrim(actor) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, capability),
  CHECK (effective_until IS NULL OR effective_until > effective_from)
);

CREATE INDEX club_capabilities_effective_idx
  ON miclub.club_capabilities (club_id, effective_from, effective_until);

COMMENT ON TABLE miclub.club_capabilities IS
  'Tenant product capabilities. Billing owns future plan-to-capability association; runtime authorization consumes only these explicit grants.';
