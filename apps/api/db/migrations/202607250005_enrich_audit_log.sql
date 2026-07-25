BEGIN;

ALTER TABLE miclub.audit_log
  ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES miclub.clubs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES miclub.user_club_memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ip inet,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS result text NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE miclub.audit_log
  DROP CONSTRAINT IF EXISTS audit_log_result_check;

ALTER TABLE miclub.audit_log
  ADD CONSTRAINT audit_log_result_check
  CHECK (result IN ('success', 'failure', 'denied'));

CREATE INDEX IF NOT EXISTS audit_log_club_created_at_idx
  ON miclub.audit_log (club_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_membership_created_at_idx
  ON miclub.audit_log (membership_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_request_id_idx
  ON miclub.audit_log (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_log_action_created_at_idx
  ON miclub.audit_log (action, created_at DESC);

COMMENT ON COLUMN miclub.audit_log.metadata IS
  'Contexto adicional sanitizado; nunca debe contener credenciales, tokens, cookies ni secretos.';
COMMENT ON COLUMN miclub.audit_log.result IS
  'Resultado normalizado del evento: success, failure o denied.';

COMMIT;
