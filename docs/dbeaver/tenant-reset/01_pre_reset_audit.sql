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

/* Schema real y matriz: columnas, FKs, conteos exactos y estrategia. */
SELECT i.table_schema, i.table_name, i.classification,
       cols.columns, COALESCE(fks.foreign_keys,'[]'::jsonb) AS foreign_keys,
       (xpath('/row/c/text()', query_to_xml(
          format('select count(*) c from %I.%I',i.table_schema,i.table_name),
          false,true,'')))[1]::text::bigint AS row_count,
       CASE i.classification
         WHEN 'TENANT_DATA' THEN 'DELETE por club_id, hijos FK primero'
         WHEN 'MIXED' THEN 'DELETE únicamente UUID diagnóstico/club verificado'
         WHEN 'GLOBAL_STRUCTURAL' THEN 'CONSERVAR y comparar huella'
         WHEN 'SYSTEM_INTERNAL' THEN 'CONSERVAR'
         ELSE 'REVISIÓN OBLIGATORIA; reset bloqueado si contiene filas' END strategy
FROM reset_inventory i
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
 FOR r IN SELECT * FROM reset_inventory WHERE classification='GLOBAL_STRUCTURAL' LOOP
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
 ) unknowns WHERE row_count>0;
 INSERT INTO reset_precheck_checks VALUES
  ('no populated UNKNOWN tables',unknown_populated IS NULL,COALESCE(unknown_populated,'none'));
END $checks$;

TABLE reset_precheck_checks;
SELECT CASE WHEN bool_and(passed) THEN 'RESET PRECHECK: PASS'
            ELSE 'RESET PRECHECK: FAIL' END AS reset_precheck
FROM reset_precheck_checks;
