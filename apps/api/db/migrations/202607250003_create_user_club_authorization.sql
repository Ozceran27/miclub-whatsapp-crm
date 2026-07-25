BEGIN;

CREATE TABLE IF NOT EXISTS miclub.user_club_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES miclub.users(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES miclub.clubs(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES miclub.roles(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  permissions text[] NOT NULL DEFAULT '{}',
  sector_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, club_id)
);

CREATE INDEX IF NOT EXISTS user_club_memberships_active_user_idx
  ON miclub.user_club_memberships (user_id) WHERE status = 'active';

COMMENT ON TABLE miclub.user_club_memberships IS
  'Autorización de una cuenta dentro de un club; fuente del TenantContext firmado en la sesión.';

COMMIT;
