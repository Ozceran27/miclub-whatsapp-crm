BEGIN;
SET LOCAL statement_timeout = '15min';
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtextextended(current_database() || ':tenant-reset',0));

/* Evidencia inmutable de esta ejecución: se captura antes del primer DELETE. */
CREATE TEMP TABLE reset_execution_counts
 (relation_name text PRIMARY KEY, table_present boolean NOT NULL, row_count bigint);
INSERT INTO reset_execution_counts VALUES
 ('miclub.clubs',true,(SELECT count(*) FROM miclub.clubs)),
 ('miclub.users',true,(SELECT count(*) FROM miclub.users)),
 ('miclub.user_club_memberships',true,(SELECT count(*) FROM miclub.user_club_memberships)),
 ('miclub.people',true,(SELECT count(*) FROM miclub.people));
DO $capture_optional_count$
DECLARE n bigint;
BEGIN
 IF to_regclass('miclub.club_memberships') IS NULL THEN
   INSERT INTO reset_execution_counts VALUES ('miclub.club_memberships',false,NULL);
 ELSE
   EXECUTE 'SELECT count(*) FROM miclub.club_memberships' INTO n;
   INSERT INTO reset_execution_counts VALUES ('miclub.club_memberships',true,n);
 END IF;
END $capture_optional_count$;
TABLE reset_execution_counts;

DO $preconditions$
DECLARE
 users_n bigint; clubs_n bigint; memberships_n bigint; people_n bigint;
 club_memberships_n bigint; bad_n bigint; target_club uuid;
BEGIN
 IF to_regclass('pg_temp.reset_precheck_checks') IS NULL
    OR to_regclass('pg_temp.reset_inventory') IS NULL
    OR to_regclass('pg_temp.reset_global_fingerprints') IS NULL THEN
   RAISE EXCEPTION 'Reset abortado: ejecute 01_pre_reset_audit.sql completo en esta misma conexión';
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

 SELECT row_count INTO users_n FROM reset_execution_counts WHERE relation_name='miclub.users';
 SELECT row_count INTO clubs_n FROM reset_execution_counts WHERE relation_name='miclub.clubs';
 SELECT row_count INTO memberships_n FROM reset_execution_counts WHERE relation_name='miclub.user_club_memberships';
 SELECT row_count INTO people_n FROM reset_execution_counts WHERE relation_name='miclub.people';
 SELECT COALESCE(row_count,0) INTO club_memberships_n FROM reset_execution_counts
  WHERE relation_name='miclub.club_memberships';

 IF clubs_n>1 THEN
   RAISE EXCEPTION 'Reset abortado [MULTIPLES_CLUBES]: clubs=%; el escenario aprobado exige exactamente uno',clubs_n;
 END IF;

 /* Estado permitido 1: base completamente reseteada, incluidas personas. */
 IF clubs_n=0 AND users_n=0 AND memberships_n=0 AND people_n=0 AND club_memberships_n=0 THEN
   NULL;
 ELSIF clubs_n<>1 THEN
   RAISE EXCEPTION 'Reset abortado [ESTADO_PARCIAL]: clubs=%, users=%, auth_memberships=%, club_memberships=%, people=%; no es base vacía ni fixture aprobado',
    clubs_n,users_n,memberships_n,club_memberships_n,people_n;
 ELSE
   /* Estado permitido 2: un solo tenant de desarrollo y su identidad diagnóstica. */
   SELECT id INTO target_club FROM miclub.clubs;

   SELECT count(*) INTO bad_n FROM miclub.user_club_memberships
    WHERE club_id IS DISTINCT FROM target_club;
   IF bad_n>0 THEN
     RAISE EXCEPTION 'Reset abortado [MEMBERSHIPS_OTROS_CLUBES]: % memberships apuntan fuera del único club',bad_n;
   END IF;

   SELECT count(*) INTO bad_n FROM miclub.users
    WHERE id <> '821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid;
   IF users_n<>1 OR bad_n>0 THEN
     RAISE EXCEPTION 'Reset abortado [USUARIOS_NO_EXPLICADOS]: users=%, inesperados=%',users_n,bad_n;
   END IF;

   IF memberships_n<>1 OR NOT EXISTS (
     SELECT 1 FROM miclub.user_club_memberships m
     WHERE m.user_id='821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid
       AND m.club_id=target_club AND m.status='active') THEN
     RAISE EXCEPTION 'Reset abortado [MEMBERSHIP_ESPERADA_AUSENTE]: se exige una única membership activa del UUID diagnóstico hacia el único club (encontradas=%)',memberships_n;
   END IF;

   SELECT count(*) INTO bad_n FROM miclub.people
    WHERE club_id IS DISTINCT FROM target_club;
   IF bad_n>0 THEN
     RAISE EXCEPTION 'Reset abortado [PERSONAS_NO_EXPLICADAS]: % personas no pertenecen al tenant objetivo',bad_n;
   END IF;
   SELECT count(*) INTO bad_n FROM miclub.people
    WHERE user_id IS NOT NULL
      AND user_id <> '821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid;
   IF bad_n>0 THEN
     RAISE EXCEPTION 'Reset abortado [IDENTIDAD_COMPARTIDA]: % personas enlazan identidades ajenas',bad_n;
   END IF;
   SELECT count(*) INTO bad_n FROM miclub.people
    WHERE user_id='821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid;
   IF bad_n>1 THEN
     RAISE EXCEPTION 'Reset abortado [IDENTIDAD_COMPARTIDA]: el UUID diagnóstico aparece en % perfiles',bad_n;
   END IF;

   IF to_regclass('miclub.club_memberships') IS NOT NULL THEN
     EXECUTE 'SELECT count(*) FROM miclub.club_memberships cm LEFT JOIN miclub.people p ON p.id=cm.person_id WHERE cm.club_id IS DISTINCT FROM $1 OR p.id IS NULL OR p.club_id IS DISTINCT FROM $1'
       INTO bad_n USING target_club;
     IF bad_n>0 THEN
       RAISE EXCEPTION 'Reset abortado [CLUB_MEMBERSHIPS_NO_EXPLICADAS]: % filas no corresponden a personas del tenant objetivo',bad_n;
     END IF;
   END IF;
 END IF;

 /* Se evalúa después de los diagnósticos específicos para no ocultar su causa. */
 IF (SELECT bool_and(passed) FROM pg_temp.reset_precheck_checks) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Reset abortado [PRE_AUDIT_FAIL]: reset_precheck_checks contiene uno o más FAIL no cubiertos por las validaciones específicas';
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
