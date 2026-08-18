BEGIN;
SET LOCAL statement_timeout = '15min';
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtextextended(current_database() || ':tenant-reset',0));

DO $preconditions$
DECLARE users_n bigint; clubs_n bigint; memberships_n bigint; bad_n bigint;
BEGIN
 IF to_regclass('pg_temp.reset_precheck_checks') IS NULL
    OR to_regclass('pg_temp.reset_inventory') IS NULL
    OR to_regclass('pg_temp.reset_global_fingerprints') IS NULL THEN
   RAISE EXCEPTION 'Reset abortado: ejecute 01_pre_reset_audit.sql completo en esta misma conexión';
 END IF;
 IF (SELECT bool_and(passed) FROM pg_temp.reset_precheck_checks) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Reset abortado: reset_precheck_checks contiene uno o más FAIL';
 END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_trigger t
     JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
     WHERE NOT t.tgisinternal AND t.tgenabled='O'
       AND (t.tgrelid,t.tgname) IN (
        (to_regclass('miclub.movements'),'movements_reject_physical_delete'),
        (to_regclass('miclub.payments'),'payments_reject_physical_delete'))
       AND p.oid='miclub.reject_financial_fact_delete()'::regprocedure) <> 2 THEN
   RAISE EXCEPTION 'Reset abortado: guards de borrado financiero ausentes, alterados o deshabilitados';
 END IF;

 SELECT count(*) INTO users_n FROM miclub.users;
 SELECT count(*) INTO clubs_n FROM miclub.clubs;
 SELECT count(*) INTO memberships_n FROM miclub.user_club_memberships;
 IF users_n NOT IN (0,1) OR clubs_n NOT IN (0,1) THEN
   RAISE EXCEPTION 'Reset abortado: users=%, clubs=%; se esperaba 0 o 1',users_n,clubs_n;
 END IF;
 SELECT count(*) INTO bad_n FROM miclub.users
  WHERE id <> '821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid;
 IF bad_n>0 THEN RAISE EXCEPTION 'Reset abortado: usuario inesperado'; END IF;
 SELECT count(*) INTO bad_n FROM miclub.user_club_memberships
  WHERE user_id <> '821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid;
 IF bad_n>0 OR memberships_n>1 THEN
   RAISE EXCEPTION 'Reset abortado: memberships inesperadas (%)',memberships_n;
 END IF;
 IF clubs_n=1 AND NOT EXISTS (
   SELECT 1 FROM miclub.user_club_memberships m
   WHERE m.user_id='821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid
     AND m.club_id=(SELECT id FROM miclub.clubs LIMIT 1)) THEN
   RAISE EXCEPTION 'Reset abortado: el club no pertenece al usuario diagnóstico';
 END IF;

 /* Revalida UNKNOWN poblados para cerrar la ventana entre auditoría y ensayo. */
 FOR bad_n IN
  SELECT (xpath('/row/c/text()',query_to_xml(
    format('select count(*) c from %I.%I',i.table_schema,i.table_name),false,true,'')))[1]::text::bigint
  FROM pg_temp.reset_inventory i WHERE i.classification='UNKNOWN'
 LOOP
  IF bad_n>0 THEN
   RAISE EXCEPTION 'Reset abortado: una tabla UNKNOWN se pobló después del precheck';
  END IF;
 END LOOP;
END $preconditions$;

/*
 * Excepción operativa acotada: el modelo ordinario prohíbe borrar hechos
 * financieros, pero un reset total aprobado debe poder retirarlos. Se desactivan
 * únicamente los dos triggers de retención, nunca triggers internos/FKs. ALTER
 * TABLE es transaccional: un error seguido de ROLLBACK restaura su estado.
 */
ALTER TABLE miclub.movements DISABLE TRIGGER movements_reject_physical_delete;
ALTER TABLE miclub.payments DISABLE TRIGGER payments_reject_physical_delete;

/* Descubre el grafo FK y borra tablas tenant en orden hijos→padres. */
DO $delete$
DECLARE r record; affected bigint; pass integer:=0; progressed boolean;
BEGIN
 CREATE TEMP TABLE reset_targets ON COMMIT DROP AS
 SELECT c.oid, n.nspname schema_name,c.relname table_name,
        EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='club_id' AND NOT a.attisdropped) has_club_id
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
   AND n.nspname !~ '^pg_toast'
   AND NOT (n.nspname='public' AND c.relname='miclub_schema_migrations');

 /* Sólo tablas club-scoped; NOT EXISTS implementa el orden topológico FK. */
 LOOP
  pass:=pass+1; progressed:=false;
  FOR r IN
   SELECT t.* FROM reset_targets t WHERE t.has_club_id
   AND NOT EXISTS (SELECT 1 FROM pg_constraint fk JOIN reset_targets child ON child.oid=fk.conrelid
                   WHERE fk.contype='f' AND fk.confrelid=t.oid AND child.has_club_id AND child.oid<>t.oid)
  LOOP
   EXECUTE format('delete from %I.%I where club_id in (select id from miclub.clubs)',r.schema_name,r.table_name);
   GET DIAGNOSTICS affected=ROW_COUNT;
   RAISE NOTICE 'DELETE %.%: % filas',r.schema_name,r.table_name,affected;
   DELETE FROM reset_targets WHERE oid=r.oid; progressed:=true;
  END LOOP;
  EXIT WHEN NOT progressed OR pass>100;
 END LOOP;
 IF EXISTS (SELECT 1 FROM reset_targets WHERE has_club_id) THEN
   RAISE EXCEPTION 'Reset abortado: grafo FK tenant sin orden seguro; tablas pendientes=%',
    (SELECT string_agg(format('%I.%I',schema_name,table_name),', ' ORDER BY schema_name,table_name)
     FROM reset_targets WHERE has_club_id);
 END IF;

 /* Las referencias indirectas soportadas se resuelven por sus cascadas declaradas. */
 DELETE FROM miclub.user_club_memberships
  WHERE user_id='821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid;
 DELETE FROM miclub.clubs;
 DELETE FROM miclub.users WHERE id='821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid;
END $delete$;

/* Deben quedar habilitados antes tanto del ROLLBACK de ensayo como del COMMIT real. */
ALTER TABLE miclub.movements ENABLE TRIGGER movements_reject_physical_delete;
ALTER TABLE miclub.payments ENABLE TRIGGER payments_reject_physical_delete;

/* ENSAYO SEGURO. Tras revisarlo, cambiar únicamente ROLLBACK por COMMIT. */
ROLLBACK;
