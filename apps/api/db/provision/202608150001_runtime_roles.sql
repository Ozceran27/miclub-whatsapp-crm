-- Versioned cluster provisioning. Run as a PostgreSQL superuser before migrations.
DO $provision$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'Role provisioning must run as a PostgreSQL superuser';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'miclub_runtime') THEN
    CREATE ROLE miclub_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'miclub_admin') THEN
    CREATE ROLE miclub_admin NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
  END IF;
  -- The pre-reset plain-text backup records this historical owner. Keeping it
  -- NOLOGIN lets a clean CI cluster restore the dump without creating a login.
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'miclub_app') THEN
    CREATE ROLE miclub_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$provision$;
