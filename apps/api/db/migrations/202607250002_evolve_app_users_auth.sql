BEGIN;

DO $$
BEGIN
  IF to_regclass('miclub.users') IS NULL AND to_regclass('miclub.app_users') IS NOT NULL THEN
    ALTER TABLE miclub.app_users RENAME TO users;
  END IF;
END $$;

ALTER TABLE miclub.users
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamp with time zone;

UPDATE miclub.users
SET status = CASE WHEN is_active THEN 'active' ELSE 'disabled' END
WHERE status IS NULL;

ALTER TABLE miclub.users
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE miclub.users
  DROP CONSTRAINT IF EXISTS users_status_check,
  DROP CONSTRAINT IF EXISTS users_failed_login_attempts_check;
ALTER TABLE miclub.users
  ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'disabled')),
  ADD CONSTRAINT users_failed_login_attempts_check CHECK (failed_login_attempts >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON miclub.users (email);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_app_users_updated_at' AND tgrelid = 'miclub.users'::regclass
  ) THEN
    ALTER TRIGGER trg_app_users_updated_at ON miclub.users RENAME TO trg_users_updated_at;
  END IF;
END $$;

COMMENT ON TABLE miclub.users IS 'Cuentas de acceso a miClub; reemplaza a miclub.app_users.';
COMMENT ON COLUMN miclub.users.status IS 'Estado de autenticación: active o disabled.';
COMMENT ON COLUMN miclub.users.failed_login_attempts IS 'Intentos fallidos consecutivos desde el último login exitoso.';
COMMENT ON COLUMN miclub.users.locked_until IS 'Impide nuevos intentos de login hasta este instante.';

COMMIT;
