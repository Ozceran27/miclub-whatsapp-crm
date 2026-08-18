/* Ejecutar en la misma conexión que 01, después del COMMIT real de 02. */
DROP TABLE IF EXISTS pg_temp.reset_validation;
CREATE TEMP TABLE reset_validation(check_name text, passed boolean, detail text);

DO $fingerprint_guard$
BEGIN
 IF to_regclass('pg_temp.reset_global_fingerprints') IS NULL THEN
   CREATE TEMP TABLE reset_global_fingerprints
    (table_schema text, table_name text, subset_name text, subset_predicate text,
     row_count bigint, content_md5 text);
   INSERT INTO reset_validation VALUES
    ('precheck fingerprints available',false,'Ejecute 01 en esta conexión');
 END IF;
END $fingerprint_guard$;

INSERT INTO reset_validation VALUES
 ('tenant clubs zero',(SELECT count(*)=0 FROM miclub.clubs),(SELECT count(*)::text FROM miclub.clubs)),
 ('tenant users zero',(SELECT count(*)=0 FROM miclub.users),(SELECT count(*)::text FROM miclub.users)),
 ('memberships zero',(SELECT count(*)=0 FROM miclub.user_club_memberships),(SELECT count(*)::text FROM miclub.user_club_memberships)),
 ('people zero',(SELECT count(*)=0 FROM miclub.people),(SELECT count(*)::text FROM miclub.people));

/* Controles de autenticación explícitos: los ausentes se informan como cero/
 * ausentes; una tabla con aspecto de auth que no encaje aquí es UNKNOWN/FAIL. */
DO $auth_validation$
DECLARE r record; n bigint;
BEGIN
 FOR r IN
  SELECT v.check_name,v.relation_name,to_regclass(v.relation_name) relation_oid
  FROM (VALUES
   ('app_sessions zero','miclub.app_sessions'),
   ('refresh tokens zero','miclub.refresh_tokens'),
   ('password-reset tokens zero','miclub.password_reset_tokens'),
   ('device tokens zero','miclub.device_tokens'),
   ('login attempts zero','miclub.login_attempts')
  ) v(check_name,relation_name)
 LOOP
  IF r.relation_oid IS NULL THEN
   INSERT INTO reset_validation VALUES(r.check_name,true,'NOT PRESENT');
  ELSE
   EXECUTE format('select count(*) from %s',r.relation_oid) INTO n;
   INSERT INTO reset_validation VALUES(r.check_name,n=0,n::text);
  END IF;
 END LOOP;

 FOR r IN
  SELECT c.oid,n.nspname schema_name,c.relname table_name
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
    AND (c.relname='app_sessions'
      OR c.relname ~* '(^|_)(refresh|password_reset|passwordreset|device)(_.*)?tokens?$'
      OR c.relname ~* '(^|_)login_attempts?$')
 LOOP
  EXECUTE format('select count(*) from %I.%I',r.schema_name,r.table_name) INTO n;
  INSERT INTO reset_validation VALUES(
   format('classified auth zero %I.%I',r.schema_name,r.table_name),n=0,n::text);
 END LOOP;

 FOR r IN
  WITH auth_tables AS (
   SELECT c.oid,n.nspname schema_name,c.relname table_name,CASE
    WHEN c.relname='app_sessions' THEN 'SESSION'
    WHEN c.relname ~* '(^|_)(refresh|password_reset|passwordreset|device)(_.*)?tokens?$' THEN 'TOKEN'
    WHEN c.relname ~* '(^|_)login_attempts?$' THEN 'LOGIN_ATTEMPT'
    ELSE 'UNKNOWN' END classification
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
     AND c.relname ~* '(auth|session|token|login|credential|password)'
  ) SELECT * FROM auth_tables WHERE classification='UNKNOWN'
 LOOP
  INSERT INTO reset_validation VALUES(
   format('UNKNOWN auth table %I.%I',r.schema_name,r.table_name),false,
   'UNKNOWN: clasificar y agregar una comprobación explícita antes de aprobar');
 END LOOP;
END $auth_validation$;

/* El manifiesto/back-up de 01 incluye también hijos sin club_id. Se conserva
 * tras el COMMIT para poder exigir cero y mostrar antes/después por tabla. */
DO $transitive_validation$
DECLARE r record; n bigint;
BEGIN
 IF to_regclass('pg_temp.reset_scope_tables') IS NULL
    OR to_regclass('pg_temp.reset_scope_rows') IS NULL THEN
  INSERT INTO reset_validation VALUES
   ('transitive reset backup available',false,'Ejecute 01 y el COMMIT de 02 en esta misma conexión');
  RETURN;
 END IF;
 FOR r IN SELECT * FROM pg_temp.reset_scope_tables LOOP
  /* No exige tabla completa vacía: en catálogos MIXED deben sobrevivir las
   * filas globales. Cuenta sólo filas idénticas a las capturadas por el grafo. */
  EXECUTE format(
   'select count(*) from %I.%I x where exists (select 1 from pg_temp.reset_scope_rows s where s.table_oid=%s and s.row_data=to_jsonb(x))',
   r.table_schema,r.table_name,r.table_oid) INTO n;
  INSERT INTO reset_validation VALUES(
   format('captured tenant rows removed %I.%I',r.table_schema,r.table_name),n=0,
   format('capturadas_antes=%s capturadas_restantes=%s clasificación=%s',r.captured_rows,n,r.classification));
 END LOOP;
END $transitive_validation$;

INSERT INTO reset_validation
SELECT 'financial delete guards enabled',count(*)=2,
       count(*)::text||'/2 enabled and canonical'
FROM pg_catalog.pg_trigger t
JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
WHERE NOT t.tgisinternal AND t.tgenabled='O'
  AND (t.tgrelid,t.tgname) IN (
   (to_regclass('miclub.movements'),'movements_reject_physical_delete'),
   (to_regclass('miclub.payments'),'payments_reject_physical_delete'))
  AND p.oid='miclub.reject_financial_fact_delete()'::regprocedure;

DO $validate$
DECLARE r record; n bigint; h text; before record; total numeric; orphan_n bigint; nullable_pred text;
BEGIN
 IF EXISTS (SELECT 1 FROM pg_temp.reset_global_fingerprints) THEN
  FOR before IN SELECT * FROM pg_temp.reset_global_fingerprints LOOP
   EXECUTE format('select count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'''' order by md5(to_jsonb(x)::text)),'''')) from %I.%I x where %s',before.table_schema,before.table_name,before.subset_predicate) INTO n,h;
   INSERT INTO reset_validation VALUES(format('global fingerprint %I.%I [%s]',before.table_schema,before.table_name,before.subset_name),n=before.row_count AND h=before.content_md5,format('subconjunto=%s antes=%s/%s después=%s/%s',before.subset_predicate,before.row_count,before.content_md5,n,h));
  END LOOP;
 END IF;

 /* Toda tabla con club_id, session/token en su nombre o monto financiero queda vacía/cero. */
 FOR r IN SELECT c.oid,n.nspname schema_name,c.relname table_name
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast'
 LOOP
  IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=r.oid AND attname='club_id' AND NOT attisdropped) THEN
   EXECUTE format('select count(*) from %I.%I where club_id in (select id from pg_temp.reset_target_clubs)',r.schema_name,r.table_name) INTO n;
   INSERT INTO reset_validation VALUES(format('target tenant zero %I.%I',r.schema_name,r.table_name),n=0,n::text);
  END IF;
  IF r.table_name ~* '(session|token)' THEN
   EXECUTE format('select count(*) from %I.%I',r.schema_name,r.table_name) INTO n;
   INSERT INTO reset_validation VALUES(format('sessions/tokens zero %I.%I',r.schema_name,r.table_name),n=0,n::text);
  END IF;
  SELECT string_agg(format('coalesce(%I,0)',a.attname),' + ') INTO h FROM pg_attribute a
   JOIN pg_type ty ON ty.oid=a.atttypid WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped
    AND ty.typcategory='N' AND a.attname ~* '(amount|balance|total|price|fee)';
  IF h IS NOT NULL AND EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=r.oid AND attname='club_id' AND NOT attisdropped) THEN
   EXECUTE format('select coalesce(sum(%s),0) from %I.%I where club_id in (select id from pg_temp.reset_target_clubs)',h,r.schema_name,r.table_name) INTO total;
   INSERT INTO reset_validation VALUES(format('financial sum zero %I.%I',r.schema_name,r.table_name),total=0,total::text);
  END IF;
 END LOOP;

 /* Antijoin genérico por cada FK simple o compuesta. */
 FOR r IN SELECT con.*, child.oid child_oid,childn.nspname child_schema,child.relname child_table,
                 parentn.nspname parent_schema,parent.relname parent_table
  FROM pg_constraint con JOIN pg_class child ON child.oid=con.conrelid JOIN pg_namespace childn ON childn.oid=child.relnamespace
  JOIN pg_class parent ON parent.oid=con.confrelid JOIN pg_namespace parentn ON parentn.oid=parent.relnamespace WHERE con.contype='f'
 LOOP
  SELECT string_agg(format('c.%I=p.%I',ca.attname,pa.attname),' AND '),
         string_agg(format('c.%I IS NOT NULL',ca.attname),' AND ') INTO h, nullable_pred
  FROM unnest(r.conkey,r.confkey) k(ca_num,pa_num)
  JOIN pg_attribute ca ON ca.attrelid=r.conrelid AND ca.attnum=k.ca_num
  JOIN pg_attribute pa ON pa.attrelid=r.confrelid AND pa.attnum=k.pa_num;
  EXECUTE format('select count(*) from %I.%I c where (%s) and not exists(select 1 from %I.%I p where %s)',r.child_schema,r.child_table,nullable_pred,r.parent_schema,r.parent_table,h) INTO orphan_n;
  INSERT INTO reset_validation VALUES('FK sin huérfanas: '||r.conname,orphan_n=0,orphan_n::text);
 END LOOP;
END $validate$;

/* Los catálogos requeridos son exactamente los capturados como globales. */
INSERT INTO reset_validation
SELECT 'catalog positive '||table_schema||'.'||table_name,row_count>0,row_count::text
FROM pg_temp.reset_global_fingerprints;

TABLE reset_validation;
SELECT CASE WHEN bool_and(passed) THEN 'DATABASE RESET VALIDATION: PASS'
            ELSE 'DATABASE RESET VALIDATION: FAIL' END AS database_reset_validation
FROM reset_validation;
