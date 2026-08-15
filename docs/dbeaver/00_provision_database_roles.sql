/* PRE-MIGRACIÓN, una sola vez. Requiere un DBA/superusuario o un login con
   CREATEROLE. Sustituir los dos parámetros DBeaver por nombres de LOGIN reales.
   Este archivo crea roles de cluster; no pertenece al migration runner. */
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='miclub_runtime') THEN
    CREATE ROLE miclub_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='miclub_admin') THEN
    CREATE ROLE miclub_admin NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
  END IF;
END
$roles$;

-- El login de la API asume exclusivamente el rol protegido. El login admin se
-- usa sólo desde procesos operativos; no configurar su contraseña en el runtime.
GRANT miclub_runtime TO ${runtime_login};
GRANT miclub_admin TO ${admin_login};
GRANT miclub_runtime TO ${admin_login}; -- permite ejecutar la prueba RLS con SET ROLE

-- Comprobación: debe devolver false, true y ambos memberships en true.
SELECT
  (SELECT rolbypassrls FROM pg_roles WHERE rolname='miclub_runtime') runtime_bypassrls,
  (SELECT rolbypassrls FROM pg_roles WHERE rolname='miclub_admin') admin_bypassrls,
  pg_has_role('${runtime_login}', 'miclub_runtime', 'MEMBER') runtime_is_member,
  pg_has_role('${admin_login}', 'miclub_admin', 'MEMBER') admin_is_member;
