BEGIN;

CREATE TABLE IF NOT EXISTS miclub.worker_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES miclub.clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES miclub.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES miclub.roles(id),
  invited_by uuid NOT NULL REFERENCES miclub.users(id),
  membership_id uuid REFERENCES miclub.user_club_memberships(id),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  worker_data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  expires_at timestamptz NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'pending' AND resolved_at IS NULL AND membership_id IS NULL)
      OR (status <> 'pending' AND resolved_at IS NOT NULL)),
  CHECK (status <> 'accepted' OR membership_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS worker_invitations_pending_tenant_user
  ON miclub.worker_invitations(club_id, user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS worker_invitations_expiration
  ON miclub.worker_invitations(expires_at) WHERE status = 'pending';

COMMENT ON TABLE miclub.worker_invitations IS
  'Invitación tenant-scoped: la membresía y sus permisos se crean exclusivamente tras aceptación del dueño. No existe bypass administrativo.';
COMMENT ON COLUMN miclub.worker_invitations.token_hash IS
  'SHA-256 del token aleatorio de un solo uso; el token sin hash nunca se persiste ni audita.';

COMMIT;
