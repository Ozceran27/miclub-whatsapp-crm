BEGIN;

ALTER TABLE miclub.users
  ADD COLUMN IF NOT EXISTS session_revoked_before timestamp with time zone;

COMMENT ON COLUMN miclub.users.session_revoked_before IS
  'Revoca cookies firmadas emitidas en o antes de este instante; logout global y cambios de seguridad.';

COMMIT;
