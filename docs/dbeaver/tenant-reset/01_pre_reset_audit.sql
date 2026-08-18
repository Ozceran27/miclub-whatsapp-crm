/* Sólo lectura persistente. Ejecutar completo en la misma conexión que 03. */
SET statement_timeout = '15min';

/*
 * PRIMER RESULT SET: filas que impedirían explicar todo por el único tenant de
 * desarrollo. Debe revisarse antes que la matriz y antes de autorizar el reset.
 */
DROP TABLE IF EXISTS pg_temp.reset_unexpected_rows;
CREATE TEMP TABLE reset_unexpected_rows
 (reason text NOT NULL, source_table text NOT NULL, row_data jsonb NOT NULL);

INSERT INTO reset_unexpected_rows
SELECT 'USUARIO_NO_OBJETIVO','miclub.users',to_jsonb(u)
FROM miclub.users u
WHERE u.id<>'821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid;

INSERT INTO reset_unexpected_rows
SELECT CASE WHEN m.user_id<>'821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid
            THEN 'MEMBERSHIP_DE_OTRO_USUARIO' ELSE 'MEMBERSHIP_HACIA_OTRO_CLUB' END,
       'miclub.user_club_memberships',to_jsonb(m)
FROM miclub.user_club_memberships m
WHERE m.user_id<>'821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid
   OR (SELECT count(*) FROM miclub.clubs)<>1
   OR m.club_id IS DISTINCT FROM (SELECT id FROM miclub.clubs LIMIT 1);

INSERT INTO reset_unexpected_rows
SELECT CASE WHEN p.club_id IS DISTINCT FROM (SELECT id FROM miclub.clubs LIMIT 1)
            THEN 'PERSONA_FUERA_DEL_TENANT_OBJETIVO' ELSE 'PERSONA_CON_IDENTIDAD_AJENA' END,
       'miclub.people',to_jsonb(p)
FROM miclub.people p
WHERE (SELECT count(*) FROM miclub.clubs)<>1
   OR p.club_id IS DISTINCT FROM (SELECT id FROM miclub.clubs LIMIT 1)
   OR (p.user_id IS NOT NULL AND p.user_id<>'821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid);

INSERT INTO reset_unexpected_rows
SELECT 'IDENTIDAD_DIAGNOSTICA_COMPARTIDA','miclub.people',to_jsonb(p)
FROM miclub.people p
WHERE p.user_id='821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid
  AND (SELECT count(*) FROM miclub.people
       WHERE user_id='821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid)>1;

DO $optional_unexpected$
BEGIN
 IF to_regclass('miclub.club_memberships') IS NOT NULL THEN
  EXECUTE $sql$
   INSERT INTO reset_unexpected_rows
   SELECT 'CLUB_MEMBERSHIP_NO_EXPLICADA','miclub.club_memberships',to_jsonb(cm)
   FROM miclub.club_memberships cm
   LEFT JOIN miclub.people p ON p.id=cm.person_id
   WHERE (SELECT count(*) FROM miclub.clubs)<>1
      OR cm.club_id IS DISTINCT FROM (SELECT id FROM miclub.clubs LIMIT 1)
      OR p.id IS NULL OR p.club_id IS DISTINCT FROM cm.club_id
  $sql$;
 END IF;
END $optional_unexpected$;

SELECT * FROM reset_unexpected_rows ORDER BY reason,source_table,row_data::text;

DROP TABLE IF EXISTS pg_temp.reset_inventory;
CREATE TEMP TABLE reset_inventory AS
WITH tables AS (
  SELECT c.oid, n.nspname AS table_schema, c.relname AS table_name
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r','p')
    AND n.nspname NOT IN ('pg_catalog','information_schema')
    AND n.nspname !~ '^pg_toast'
), traits AS (
  SELECT t.*,
    bool_or(a.attname = 'club_id') FILTER (WHERE NOT a.attisdropped) AS has_club_id,
    bool_or(a.attname = 'user_id') FILTER (WHERE NOT a.attisdropped) AS has_user_id
  FROM tables t
  LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum>0
  GROUP BY t.oid,t.table_schema,t.table_name
)
SELECT *, CASE
  WHEN table_schema LIKE 'pg_%' OR table_schema='information_schema'
    OR (table_schema='public' AND table_name='miclub_schema_migrations')
    THEN 'SYSTEM_INTERNAL'
  WHEN has_club_id THEN 'TENANT_DATA'
  WHEN table_name IN ('clubs','users') OR has_user_id THEN 'MIXED'
  WHEN table_name ~ '(catalog|currenc|discount_rate|system_month|plan|entitlement)'
    OR table_name IN (
      'payment_methods', 'category_import_aliases', 'features',
      'import_amount_normalization_rules', 'sector_templates'
    ) THEN 'GLOBAL_STRUCTURAL'
  ELSE 'UNKNOWN' END AS classification
FROM traits;

/*
 * Alcance transitivo del reset.  La pertenencia no se infiere por nombres: una
 * fila sin club_id sólo entra si una FK real apunta a una fila ya capturada.
 * row_data es además el respaldo temporal e inmutable usado por 02 y 03.
 */
DROP TABLE IF EXISTS pg_temp.reset_target_clubs;
CREATE TEMP TABLE reset_target_clubs AS SELECT id FROM miclub.clubs;
DROP TABLE IF EXISTS pg_temp.reset_fk_edges;
CREATE TEMP TABLE reset_fk_edges AS
SELECT con.oid constraint_oid,con.conname,con.conrelid child_oid,
       con.confrelid parent_oid,con.conkey child_keys,con.confkey parent_keys
FROM pg_constraint con
JOIN pg_class child ON child.oid=con.conrelid
JOIN pg_namespace child_ns ON child_ns.oid=child.relnamespace
JOIN pg_class parent ON parent.oid=con.confrelid
JOIN pg_namespace parent_ns ON parent_ns.oid=parent.relnamespace
WHERE con.contype='f' AND array_length(con.conkey,1)=array_length(con.confkey,1)
  AND child_ns.nspname NOT IN ('pg_catalog','information_schema')
  AND parent_ns.nspname NOT IN ('pg_catalog','information_schema')
  AND child_ns.nspname !~ '^pg_toast' AND parent_ns.nspname !~ '^pg_toast';

DROP TABLE IF EXISTS pg_temp.reset_scope_rows;
CREATE TEMP TABLE reset_scope_rows
 (table_oid oid NOT NULL,row_hash text NOT NULL,row_data jsonb NOT NULL,
  depth integer NOT NULL,via_constraint oid,
  PRIMARY KEY(table_oid,row_hash));
DO $discover_scope$
DECLARE r record; predicate text; inserted bigint; progressed bigint:=1; rounds integer:=0;
BEGIN
 /* Raíces tenant: el predicado queda fijado por los IDs capturados, no por el
  * estado futuro de clubs. clubs se respalda también como raíz del grafo. */
 FOR r IN SELECT i.* FROM reset_inventory i WHERE i.has_club_id LOOP
  EXECUTE format(
   'insert into reset_scope_rows select %s,md5(to_jsonb(x)::text)||'':''||x.ctid::text,to_jsonb(x),0,null from %I.%I x where x.club_id in (select id from reset_target_clubs) on conflict do nothing',
   r.oid,r.table_schema,r.table_name);
 END LOOP;
 INSERT INTO reset_scope_rows
 SELECT 'miclub.clubs'::regclass,md5(to_jsonb(x)::text)||':'||x.ctid::text,to_jsonb(x),0,NULL
 FROM miclub.clubs x ON CONFLICT DO NOTHING;

 WHILE progressed>0 LOOP
  rounds:=rounds+1; progressed:=0;
  IF rounds>100 THEN RAISE EXCEPTION 'Reset UNKNOWN: recursión FK excedió 100 niveles; intervención DBA requerida'; END IF;
  FOR r IN
   SELECT e.*,cn.nspname child_schema,c.relname child_table
   FROM reset_fk_edges e JOIN pg_class c ON c.oid=e.child_oid
   JOIN pg_namespace cn ON cn.oid=c.relnamespace
   WHERE EXISTS (SELECT FROM reset_scope_rows s WHERE s.table_oid=e.parent_oid)
  LOOP
   SELECT string_agg(format('to_jsonb(x)->%L = p.row_data->%L',ca.attname,pa.attname),' AND ' ORDER BY k.ord)
    INTO predicate
   FROM unnest(r.child_keys,r.parent_keys) WITH ORDINALITY k(child_att,parent_att,ord)
   JOIN pg_attribute ca ON ca.attrelid=r.child_oid AND ca.attnum=k.child_att
   JOIN pg_attribute pa ON pa.attrelid=r.parent_oid AND pa.attnum=k.parent_att;
   IF predicate IS NULL THEN
    RAISE EXCEPTION 'Reset UNKNOWN: FK % no permite demostrar pertenencia; intervención DBA requerida',r.conname;
   END IF;
   EXECUTE format(
    'insert into reset_scope_rows select %s,md5(to_jsonb(x)::text)||'':''||x.ctid::text,to_jsonb(x),coalesce((select max(depth)+1 from reset_scope_rows where table_oid=%s),1),%s from %I.%I x where exists (select 1 from reset_scope_rows p where p.table_oid=%s and %s) on conflict do nothing',
    r.child_oid,r.parent_oid,r.constraint_oid,r.child_schema,r.child_table,r.parent_oid,predicate);
   GET DIAGNOSTICS inserted=ROW_COUNT; progressed:=progressed+inserted;
  END LOOP;
 END LOOP;
END $discover_scope$;

DROP TABLE IF EXISTS pg_temp.reset_scope_tables;
CREATE TEMP TABLE reset_scope_tables AS
SELECT s.table_oid,n.nspname table_schema,c.relname table_name,
       bool_or(i.has_club_id) has_club_id,min(s.depth) min_depth,
       count(*) captured_rows,
       CASE WHEN bool_or(i.has_club_id) THEN 'TENANT_DATA'
            WHEN c.oid='miclub.clubs'::regclass THEN 'MIXED'
            ELSE 'TENANT_TRANSITIVE' END classification
FROM reset_scope_rows s JOIN pg_class c ON c.oid=s.table_oid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN reset_inventory i ON i.oid=s.table_oid
GROUP BY s.table_oid,n.nspname,c.relname,c.oid;

/* Una tabla hija alcanzable pero con una FK no materializable nunca recibe un
 * DELETE alternativo. Queda UNKNOWN y el gate inferior aborta si está poblada. */
SELECT t.*,jsonb_agg(s.row_data ORDER BY s.row_hash) AS temporary_backup
FROM reset_scope_tables t JOIN reset_scope_rows s ON s.table_oid=t.table_oid
GROUP BY t.table_oid,t.table_schema,t.table_name,t.has_club_id,t.min_depth,t.captured_rows,t.classification
ORDER BY t.min_depth,t.table_schema,t.table_name;

/* Schema real y matriz: columnas, FKs, conteos exactos y estrategia. */
SELECT i.table_schema, i.table_name, COALESCE(scope.classification,i.classification) classification,
       cols.columns, COALESCE(fks.foreign_keys,'[]'::jsonb) AS foreign_keys,
       (xpath('/row/c/text()', query_to_xml(
          format('select count(*) c from %I.%I',i.table_schema,i.table_name),
          false,true,'')))[1]::text::bigint AS row_count,
       CASE COALESCE(scope.classification,i.classification)
         WHEN 'TENANT_DATA' THEN 'DELETE por club_id, hijos FK primero'
         WHEN 'TENANT_TRANSITIVE' THEN 'DELETE por FK real hacia IDs respaldados, hijos FK primero'
         WHEN 'MIXED' THEN 'DELETE únicamente UUID diagnóstico/club verificado'
         WHEN 'GLOBAL_STRUCTURAL' THEN 'CONSERVAR y comparar huella'
         WHEN 'SYSTEM_INTERNAL' THEN 'CONSERVAR'
         ELSE 'REVISIÓN OBLIGATORIA; reset bloqueado si contiene filas' END strategy
FROM reset_inventory i
LEFT JOIN reset_scope_tables scope ON scope.table_oid=i.oid
JOIN LATERAL (
 SELECT jsonb_agg(jsonb_build_object('name',column_name,'type',data_type,
          'nullable',is_nullable,'default',column_default) ORDER BY ordinal_position) columns
 FROM information_schema.columns c
 WHERE c.table_schema=i.table_schema AND c.table_name=i.table_name
) cols ON true
LEFT JOIN LATERAL (
 SELECT jsonb_agg(jsonb_build_object('constraint',con.conname,
          'references',con.confrelid::regclass::text,'definition',pg_get_constraintdef(con.oid))) foreign_keys
 FROM pg_catalog.pg_constraint con WHERE con.conrelid=i.oid AND con.contype='f'
) fks ON true
ORDER BY i.table_schema,i.table_name;

/* Diagnóstico explícito del usuario, memberships y clubes. */
SELECT u.* FROM miclub.users u
 WHERE u.id='821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid;
SELECT m.*, c.name AS club_name
 FROM miclub.user_club_memberships m
 LEFT JOIN miclub.clubs c ON c.id=m.club_id
 WHERE m.user_id='821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid;
SELECT DISTINCT c.* FROM miclub.clubs c
 JOIN miclub.user_club_memberships m ON m.club_id=c.id
 WHERE m.user_id='821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid;

/* Huellas de catálogos, válidas sólo durante esta conexión. */
DROP TABLE IF EXISTS pg_temp.reset_global_fingerprints;
CREATE TEMP TABLE reset_global_fingerprints
 (table_schema text, table_name text, row_count bigint, content_md5 text,
  PRIMARY KEY(table_schema,table_name));
DO $audit$
DECLARE r record; n bigint; h text;
BEGIN
 FOR r IN SELECT * FROM reset_inventory i WHERE classification='GLOBAL_STRUCTURAL' AND NOT EXISTS (SELECT FROM reset_scope_tables t WHERE t.table_oid=i.oid) LOOP
   EXECUTE format('select count(*), md5(coalesce(string_agg(md5(to_jsonb(x)::text),'''' order by md5(to_jsonb(x)::text)),'''')) from %I.%I x',r.table_schema,r.table_name)
     INTO n,h;
   INSERT INTO pg_temp.reset_global_fingerprints VALUES(r.table_schema,r.table_name,n,h);
 END LOOP;
END $audit$;
SELECT * FROM pg_temp.reset_global_fingerprints ORDER BY 1,2;

/* PASS exige forma soportada, como máximo el único fixture y ningún UNKNOWN poblado. */
DROP TABLE IF EXISTS pg_temp.reset_precheck_checks;
CREATE TEMP TABLE reset_precheck_checks
 (check_name text PRIMARY KEY, passed boolean NOT NULL, detail text NOT NULL);

INSERT INTO reset_precheck_checks VALUES
 ('required table miclub.users',to_regclass('miclub.users') IS NOT NULL,COALESCE(to_regclass('miclub.users')::text,'MISSING')),
 ('required table miclub.clubs',to_regclass('miclub.clubs') IS NOT NULL,COALESCE(to_regclass('miclub.clubs')::text,'MISSING')),
 ('required table miclub.user_club_memberships',to_regclass('miclub.user_club_memberships') IS NOT NULL,COALESCE(to_regclass('miclub.user_club_memberships')::text,'MISSING'));

DO $checks$
DECLARE
 n bigint; unexpected bigint; unknown_populated text;
 users_n bigint:=0; clubs_n bigint:=0; memberships_n bigint:=0;
 people_n bigint:=0; club_memberships_n bigint:=0; approved boolean:=false;
BEGIN
 /* SQL dinámico permite informar tablas requeridas ausentes sin referenciarlas. */
 IF to_regclass('miclub.users') IS NOT NULL THEN
  EXECUTE 'SELECT count(*) FROM miclub.users' INTO n;
  INSERT INTO reset_precheck_checks VALUES ('users count supported',n<=1,n::text);
  EXECUTE $$SELECT count(*) FROM miclub.users WHERE id <> '821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid$$ INTO unexpected;
  INSERT INTO reset_precheck_checks VALUES ('only diagnostic user',unexpected=0,unexpected::text||' unexpected');
 END IF;
 IF to_regclass('miclub.clubs') IS NOT NULL THEN
  EXECUTE 'SELECT count(*) FROM miclub.clubs' INTO n;
  INSERT INTO reset_precheck_checks VALUES ('clubs count supported',n<=1,n::text);
 END IF;
 IF to_regclass('miclub.user_club_memberships') IS NOT NULL THEN
  EXECUTE 'SELECT count(*) FROM miclub.user_club_memberships' INTO memberships_n;
  EXECUTE $$SELECT count(*) FROM miclub.user_club_memberships WHERE user_id <> '821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid$$ INTO unexpected;
  INSERT INTO reset_precheck_checks VALUES ('only diagnostic memberships',unexpected=0,unexpected::text||' unexpected');
 END IF;
 IF to_regclass('miclub.users') IS NOT NULL THEN
  EXECUTE 'SELECT count(*) FROM miclub.users' INTO users_n;
 END IF;
 IF to_regclass('miclub.clubs') IS NOT NULL THEN
  EXECUTE 'SELECT count(*) FROM miclub.clubs' INTO clubs_n;
 END IF;
 IF to_regclass('miclub.people') IS NOT NULL THEN
  EXECUTE 'SELECT count(*) FROM miclub.people' INTO people_n;
 END IF;
 IF to_regclass('miclub.club_memberships') IS NOT NULL THEN
  EXECUTE 'SELECT count(*) FROM miclub.club_memberships' INTO club_memberships_n;
 END IF;

 approved := (clubs_n=0 AND users_n=0 AND memberships_n=0
              AND people_n=0 AND club_memberships_n=0)
   OR (clubs_n=1 AND users_n=1 AND memberships_n=1
       AND NOT EXISTS (SELECT FROM reset_unexpected_rows)
       AND EXISTS (
        SELECT 1 FROM miclub.user_club_memberships m
        WHERE m.user_id='821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid
          AND m.club_id=(SELECT id FROM miclub.clubs)
          AND m.status='active'));
 INSERT INTO reset_precheck_checks VALUES
  ('state is empty or approved development tenant',approved,
   format('clubs=%s users=%s auth_memberships=%s club_memberships=%s people=%s unexpected_rows=%s',
    clubs_n,users_n,memberships_n,club_memberships_n,people_n,
    (SELECT count(*) FROM reset_unexpected_rows)));

 SELECT string_agg(format('%I.%I=%s',table_schema,table_name,row_count),', ' ORDER BY table_schema,table_name)
 INTO unknown_populated FROM (
  SELECT i.table_schema,i.table_name,
   (xpath('/row/c/text()',query_to_xml(format('select count(*) c from %I.%I',i.table_schema,i.table_name),false,true,'')))[1]::text::bigint row_count
  FROM reset_inventory i WHERE classification='UNKNOWN'
    AND NOT EXISTS (SELECT FROM reset_scope_tables t WHERE t.table_oid=i.oid)
 ) unknowns WHERE row_count>0;
 INSERT INTO reset_precheck_checks VALUES
  ('no populated UNKNOWN tables',unknown_populated IS NULL,COALESCE(unknown_populated,'none'));
END $checks$;

TABLE reset_precheck_checks;
SELECT CASE WHEN bool_and(passed) THEN 'RESET PRECHECK: PASS'
            ELSE 'RESET PRECHECK: FAIL' END AS reset_precheck
FROM reset_precheck_checks;
