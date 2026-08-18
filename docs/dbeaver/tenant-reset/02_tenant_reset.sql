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
INSERT INTO reset_execution_counts
SELECT format('%I.%I',table_schema,table_name),true,captured_rows
FROM pg_temp.reset_scope_tables
ON CONFLICT (relation_name) DO UPDATE SET row_count=excluded.row_count;
TABLE reset_execution_counts;

/*
 * La identidad es global, pero sus vínculos no se reducen a la membership de
 * autorización. Se toma una foto de los tenants eliminados y se descubre cada
 * FK simple real hacia users (people.user_id, employees.user_id, invitaciones,
 * auditoría y futuras incorporaciones incluidas). Así ningún usuario queda
 * fuera del análisis por depender de una lista de tablas mantenida a mano.
 */
/* CREATE TABLE AS sólo admite nombres de columna, no tipos/constraints, en su
 * lista parentizada. Crear primero la tabla permite conservar la PK que protege
 * el alcance y evita el error 42601 que PostgreSQL señala al llegar a AS. */
CREATE TEMP TABLE _target_clubs
 (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _target_clubs(id)
 SELECT id FROM miclub.clubs;
CREATE TEMP TABLE _user_references ON COMMIT DROP AS
SELECT con.oid constraint_oid,con.conrelid table_oid,n.nspname table_schema,
       c.relname table_name,a.attname user_column,con.confdeltype,
       EXISTS (SELECT 1 FROM pg_attribute ca WHERE ca.attrelid=c.oid
               AND ca.attname='club_id' AND NOT ca.attisdropped) has_club_id
FROM pg_constraint con
JOIN pg_class c ON c.oid=con.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=con.conkey[1]
WHERE con.contype='f' AND con.confrelid='miclub.users'::regclass
  AND array_length(con.conkey,1)=1 AND array_length(con.confkey,1)=1;

CREATE TEMP TABLE _candidate_users(user_id uuid PRIMARY KEY) ON COMMIT DROP;
DO $candidate_users$
DECLARE r record;
BEGIN
 FOR r IN SELECT * FROM _user_references WHERE has_club_id LOOP
  EXECUTE format(
   'insert into _candidate_users select distinct %I from %I.%I where club_id in (select id from _target_clubs) and %I is not null on conflict do nothing',
   r.user_column,r.table_schema,r.table_name,r.user_column);
 END LOOP;
END $candidate_users$;

/* Tablas de autenticación conocidas. Toda otra tabla con nombre de auth queda
 * UNKNOWN y bloquea el reset hasta que un DBA clasifique su semántica. */
CREATE TEMP TABLE _auth_table_inventory ON COMMIT DROP AS
SELECT c.oid,n.nspname table_schema,c.relname table_name,
 CASE
  WHEN c.relname='app_sessions' THEN 'SESSION'
  WHEN c.relname ~* '(^|_)(refresh|password_reset|passwordreset|device)(_.*)?tokens?$' THEN 'TOKEN'
  WHEN c.relname ~* '(^|_)login_attempts?$' THEN 'LOGIN_ATTEMPT'
  ELSE 'UNKNOWN'
 END classification
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
 AND c.relname ~* '(auth|session|token|login|credential|password)';

DO $identity_guard$
DECLARE r record; bad_n bigint;
BEGIN
 IF EXISTS (SELECT 1 FROM _auth_table_inventory WHERE classification='UNKNOWN') THEN
  RAISE EXCEPTION 'Reset abortado [AUTH_TABLE_UNKNOWN]: tablas=%',
   (SELECT string_agg(format('%I.%I',table_schema,table_name),', ' ORDER BY table_schema,table_name)
    FROM _auth_table_inventory WHERE classification='UNKNOWN');
 END IF;
 FOR r IN SELECT * FROM _user_references LOOP
  IF r.has_club_id THEN
   EXECUTE format('select count(*) from %I.%I x join _candidate_users c on c.user_id=x.%I where x.club_id not in (select id from _target_clubs)',
                  r.table_schema,r.table_name,r.user_column) INTO bad_n;
  ELSIF EXISTS (SELECT 1 FROM _auth_table_inventory a WHERE a.oid=r.table_oid AND a.classification<>'UNKNOWN') THEN
   bad_n:=0; /* hijo global de autenticación: pertenece a la identidad */
  ELSE
   EXECUTE format('select count(*) from %I.%I x join _candidate_users c on c.user_id=x.%I',
                  r.table_schema,r.table_name,r.user_column) INTO bad_n;
  END IF;
  IF bad_n>0 THEN
   RAISE EXCEPTION 'Reset abortado [IDENTIDAD_COMPARTIDA]: %.% columna % conserva % referencias fuera de los tenants objetivo o sin tenant atribuible',
    r.table_schema,r.table_name,r.user_column,bad_n;
  END IF;
 END LOOP;
END $identity_guard$;

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
    AND NOT EXISTS (SELECT FROM pg_temp.reset_scope_tables t WHERE t.table_oid=i.oid)
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

/* Borra exactamente el alcance respaldado por 01, en el orden topológico
 * producido por las FKs. No existe fallback DELETE genérico: cada condición es
 * club_id contra IDs capturados o una FK real contra el respaldo de su padre. */
DO $delete$
DECLARE r record; e record; affected bigint; predicate text; where_sql text;
        progressed boolean; remaining integer;
BEGIN
 IF to_regclass('pg_temp.reset_scope_rows') IS NULL
    OR to_regclass('pg_temp.reset_scope_tables') IS NULL
    OR to_regclass('pg_temp.reset_fk_edges') IS NULL
    OR to_regclass('pg_temp.reset_target_clubs') IS NULL THEN
  RAISE EXCEPTION 'Reset abortado: faltan alcance/IDs/backups transitivos de 01';
 END IF;

 CREATE TEMP TABLE reset_delete_order
  (position integer GENERATED ALWAYS AS IDENTITY,table_oid oid PRIMARY KEY,
   table_schema text,table_name text) ON COMMIT DROP;
 CREATE TEMP TABLE reset_pending ON COMMIT DROP AS
  SELECT * FROM reset_scope_tables WHERE table_oid<>'miclub.clubs'::regclass;

 /* Un nodo sólo sale cuando ya salieron todos sus hijos alcanzados. Una FK
  * autorreferencial NO ACTION/CASCADE/SET NULL no crea una dependencia entre
  * tablas: PostgreSQL puede borrar en una única sentencia todas las filas del
  * alcance y comprueba NO ACTION al final de esa sentencia. RESTRICT sí exige
  * comprobación inmediata y se mantiene como bloqueo. Si una iteración no
  * progresa, el remanente es un ciclo real entre tablas (o un self-RESTRICT) y
  * requiere decisión DBA. */
 LOOP
  progressed:=false;
  FOR r IN SELECT p.* FROM reset_pending p
   WHERE NOT EXISTS (
    SELECT 1 FROM reset_fk_edges fk JOIN reset_pending child ON child.table_oid=fk.child_oid
    WHERE fk.parent_oid=p.table_oid AND child.table_oid<>p.table_oid)
   AND NOT EXISTS (
    SELECT 1 FROM reset_fk_edges fk
    JOIN pg_constraint self_con ON self_con.oid=fk.constraint_oid
    WHERE fk.parent_oid=p.table_oid AND fk.child_oid=p.table_oid
      AND self_con.confdeltype='r')
   ORDER BY p.min_depth DESC,p.table_schema,p.table_name
  LOOP
   INSERT INTO reset_delete_order(table_oid,table_schema,table_name)
    VALUES(r.table_oid,r.table_schema,r.table_name);
   DELETE FROM reset_pending WHERE table_oid=r.table_oid; progressed:=true;
  END LOOP;
  SELECT count(*) INTO remaining FROM reset_pending;
  EXIT WHEN remaining=0;
  IF NOT progressed THEN
   RAISE EXCEPTION 'Reset abortado: grafo FK tenant sin orden seguro: ciclo; intervención DBA requerida; tablas pendientes=%',
    (SELECT string_agg(format('%I.%I',table_schema,table_name),', ' ORDER BY table_schema,table_name) FROM reset_pending);
  END IF;
 END LOOP;

 FOR r IN SELECT * FROM reset_delete_order ORDER BY position LOOP
  where_sql:=NULL;
  IF r.table_oid IN (SELECT table_oid FROM reset_scope_tables WHERE has_club_id) THEN
   where_sql:='x.club_id in (select id from reset_target_clubs)';
  END IF;
  FOR e IN SELECT fk.* FROM reset_fk_edges fk
   WHERE fk.child_oid=r.table_oid
     AND EXISTS (SELECT FROM reset_scope_rows p WHERE p.table_oid=fk.parent_oid)
  LOOP
   SELECT string_agg(format('to_jsonb(x)->%L = p.row_data->%L',ca.attname,pa.attname),' AND ' ORDER BY k.ord)
    INTO predicate
   FROM unnest(e.child_keys,e.parent_keys) WITH ORDINALITY k(child_att,parent_att,ord)
   JOIN pg_attribute ca ON ca.attrelid=e.child_oid AND ca.attnum=k.child_att
   JOIN pg_attribute pa ON pa.attrelid=e.parent_oid AND pa.attnum=k.parent_att;
   IF predicate IS NULL THEN
    RAISE EXCEPTION 'Reset abortado [UNKNOWN]: FK % no demuestra pertenencia; intervención DBA requerida',e.conname;
   END IF;
   where_sql:=concat_ws(' OR ',where_sql,format('exists (select 1 from reset_scope_rows p where p.table_oid=%s and %s)',e.parent_oid,predicate));
  END LOOP;
  IF where_sql IS NULL THEN
   RAISE EXCEPTION 'Reset abortado [UNKNOWN]: %.% no tiene condición tenant derivada de FK',r.table_schema,r.table_name;
  END IF;
  EXECUTE format('delete from %I.%I x where %s',r.table_schema,r.table_name,where_sql);
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>(SELECT captured_rows FROM reset_scope_tables WHERE table_oid=r.table_oid) THEN
   RAISE EXCEPTION 'Reset abortado: conteo cambió para %.% (capturado %, eliminado %)',r.table_schema,r.table_name,
    (SELECT captured_rows FROM reset_scope_tables WHERE table_oid=r.table_oid),affected;
  END IF;
  RAISE NOTICE 'DELETE %.%: % filas (orden %)',r.table_schema,r.table_name,affected,r.position;
 END LOOP;

 /* Identidad global: conserva sus guards específicos y el inventario dinámico. */
 FOR r IN SELECT ur.* FROM _user_references ur WHERE ur.confdeltype<>'c'
 LOOP
  EXECUTE format('delete from %I.%I x using _candidate_users c where x.%I=c.user_id',
                 r.table_schema,r.table_name,r.user_column);
 END LOOP;
 DELETE FROM miclub.user_club_memberships m USING _candidate_users c WHERE m.user_id=c.user_id;
 DELETE FROM miclub.clubs c WHERE EXISTS (SELECT FROM reset_target_clubs t WHERE t.id=c.id);
 DELETE FROM miclub.users u USING _candidate_users c WHERE u.id=c.user_id
  AND NOT EXISTS (SELECT 1 FROM pg_constraint con
                  WHERE con.contype='f' AND con.confrelid='miclub.users'::regclass
                    AND NOT EXISTS (SELECT 1 FROM _user_references ur WHERE ur.constraint_oid=con.oid));
END $delete$;

/* Deben quedar habilitados antes tanto del ROLLBACK de ensayo como del COMMIT real. */
ALTER TABLE miclub.movements ENABLE TRIGGER movements_reject_physical_delete;
ALTER TABLE miclub.payments ENABLE TRIGGER payments_reject_physical_delete;

/* ENSAYO SEGURO. Tras revisarlo, cambiar únicamente ROLLBACK por COMMIT. */
ROLLBACK;
