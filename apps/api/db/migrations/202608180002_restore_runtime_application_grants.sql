BEGIN;

-- The API connects with SET ROLE miclub_runtime. The first RLS rollout granted
-- only its priority tables, unintentionally removing access to clubs and the
-- remaining catalogs/read models needed by registration, onboarding and XLSX.
-- HTTP authorization and explicit tenant predicates remain mandatory; priority
-- tenant tables continue to be FORCE RLS and fail closed without app.club_id.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA miclub TO miclub_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA miclub TO miclub_runtime;

-- Keep later application tables usable when migrations are executed by the
-- current schema owner. RLS policies are not changed or bypassed by this grant.
ALTER DEFAULT PRIVILEGES IN SCHEMA miclub
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO miclub_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA miclub
  GRANT USAGE, SELECT ON SEQUENCES TO miclub_runtime;

DO $validation$
BEGIN
  IF NOT has_table_privilege('miclub_runtime', 'miclub.clubs', 'INSERT')
     OR NOT has_table_privilege('miclub_runtime', 'miclub.plans', 'SELECT')
     OR NOT has_table_privilege('miclub_runtime', 'miclub.club_onboarding', 'INSERT')
     OR NOT has_table_privilege('miclub_runtime', 'miclub.xlsx_import_rows', 'INSERT') THEN
    RAISE EXCEPTION 'No se pudieron restaurar los permisos operativos de miclub_runtime';
  END IF;
END
$validation$;

COMMIT;
