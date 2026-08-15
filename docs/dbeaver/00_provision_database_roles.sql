/* PRE-MIGRACIÓN, una sola vez. Requiere un superusuario PostgreSQL: BYPASSRLS
   es un atributo reservado, por lo que CREATEROLE por sí solo no es suficiente.
   Sustituir los dos parámetros DBeaver por nombres de LOGIN reales.
   Este archivo crea roles de cluster; no pertenece al migration runner. */
DO $preflight$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION USING
      ERRCODE='insufficient_privilege',
      MESSAGE=format('La conexión actual (%s) no es superusuario PostgreSQL',current_user),
      HINT='En una instalación local ejecute el aprovisionamiento como el usuario postgres; consulte docs/runtime-rls-rollout.md';
  END IF;
END
$preflight$;

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
