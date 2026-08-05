/*
  miClub — permisos administrativos manuales.

  Objetivo: asegurar privilegios mínimos de uso para roles de aplicación sobre
  el schema miclub sin depender de UUID hardcodeados ni modificar datos.

  Precondiciones:
  - Ejecutar con un usuario dueño del schema/objetos o superusuario.
  - Ajustar los nombres de roles en tmp_admin_permission_roles si la instalación
    usa otros roles. El script omite roles inexistentes para ser idempotente.
*/

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

CREATE TEMP TABLE tmp_admin_permission_roles (
  role_name name PRIMARY KEY,
  can_write boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_admin_permission_roles (role_name, can_write)
VALUES
  ('miclub_app', true),
  ('miclub_readonly', false)
ON CONFLICT (role_name) DO UPDATE SET can_write = EXCLUDED.can_write;

SELECT
  'permission_preconditions' AS diagnostic,
  r.role_name,
  pg_roles.rolname IS NOT NULL AS role_exists,
  r.can_write
FROM tmp_admin_permission_roles r
LEFT JOIN pg_roles ON pg_roles.rolname = r.role_name
ORDER BY r.role_name;

DO $$
DECLARE
  app_role name;
BEGIN
  IF to_regnamespace('miclub') IS NULL THEN
    RAISE EXCEPTION 'Precondición fallida: el schema miclub no existe';
  END IF;

  FOR app_role IN SELECT role_name FROM tmp_admin_permission_roles WHERE role_name IN (SELECT rolname FROM pg_roles) LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA miclub TO %I', app_role);
    EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA miclub TO %I', app_role);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA miclub TO %I', app_role);
  END LOOP;

  FOR app_role IN SELECT role_name FROM tmp_admin_permission_roles WHERE can_write AND role_name IN (SELECT rolname FROM pg_roles) LOOP
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA miclub TO %I', app_role);
    EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA miclub TO %I', app_role);
  END LOOP;
END $$;

SELECT
  'permission_validation' AS diagnostic,
  r.role_name,
  pg_roles.rolname IS NOT NULL AS role_exists,
  CASE
    WHEN pg_roles.rolname IS NULL THEN NULL
    ELSE has_schema_privilege(pg_roles.oid, 'miclub', 'USAGE')
  END AS has_schema_usage,
  CASE
    WHEN pg_roles.rolname IS NULL THEN NULL
    ELSE has_table_privilege(pg_roles.oid, 'miclub.clubs', 'SELECT')
  END AS can_select_reference_table,
  r.can_write,
  CASE
    WHEN pg_roles.rolname IS NULL THEN 'omitido: el rol no existe en esta base'
    WHEN r.can_write THEN 'ok: rol existente con permisos de lectura/escritura solicitados'
    ELSE 'ok: rol existente con permisos de lectura solicitados'
  END AS validation_note
FROM tmp_admin_permission_roles r
LEFT JOIN pg_roles ON pg_roles.rolname = r.role_name
ORDER BY r.role_name;

COMMIT;
