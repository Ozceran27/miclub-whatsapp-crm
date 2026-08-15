BEGIN;

-- Cluster roles are provisioned once by a DBA with
-- docs/dbeaver/00_provision_database_roles.sql. A schema migration must not need
-- CREATEROLE: fail with an actionable precondition instead.
DO $roles$
DECLARE runtime_bypass boolean; admin_bypass boolean;
BEGIN
  SELECT rolbypassrls INTO runtime_bypass FROM pg_roles WHERE rolname = 'miclub_runtime';
  SELECT rolbypassrls INTO admin_bypass FROM pg_roles WHERE rolname = 'miclub_admin';
  IF runtime_bypass IS NULL OR admin_bypass IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'object_not_in_prerequisite_state',
      MESSAGE = 'Faltan los roles miclub_runtime/miclub_admin',
      HINT = 'Un DBA con CREATEROLE debe ejecutar docs/dbeaver/00_provision_database_roles.sql antes de esta migración';
  END IF;
  IF runtime_bypass OR NOT admin_bypass THEN
    RAISE EXCEPTION 'Atributos inseguros: miclub_runtime debe ser NOBYPASSRLS y miclub_admin debe ser BYPASSRLS';
  END IF;
END
$roles$;

GRANT USAGE ON SCHEMA miclub TO miclub_runtime, miclub_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA miclub TO miclub_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA miclub TO miclub_admin;

-- First rollout: the tenant tables with the highest exposure. Later migrations
-- can append tables to this list after their club_id backfill is complete.
DO $priority_rls$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'people', 'club_memberships', 'user_club_memberships', 'movements',
    'enrollments', 'activities', 'crm_message_templates',
    'crm_message_history', 'import_batches', 'import_errors', 'xlsx_import_rows'
  ]
  LOOP
    IF to_regclass(format('miclub.%I', target_table)) IS NULL THEN
      RAISE EXCEPTION 'Priority RLS table miclub.% is missing', target_table;
    END IF;
    IF NOT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = 'miclub' AND columns.table_name = target_table
        AND column_name = 'club_id' AND is_nullable = 'NO'
    ) THEN
      RAISE EXCEPTION 'Priority RLS requires miclub.%.club_id NOT NULL', target_table;
    END IF;

    EXECUTE format('ALTER TABLE miclub.%I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format('ALTER TABLE miclub.%I FORCE ROW LEVEL SECURITY', target_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON miclub.%I', target_table);
    EXECUTE format($policy$
      CREATE POLICY tenant_isolation ON miclub.%I TO miclub_runtime
      USING (club_id = NULLIF(current_setting('app.club_id', true), '')::uuid)
      WITH CHECK (club_id = NULLIF(current_setting('app.club_id', true), '')::uuid)
    $policy$, target_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON miclub.%I TO miclub_runtime', target_table);
  END LOOP;
END
$priority_rls$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA miclub TO miclub_runtime;

COMMIT;
