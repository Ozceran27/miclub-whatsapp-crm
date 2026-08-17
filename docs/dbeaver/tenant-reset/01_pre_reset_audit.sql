/* Sólo lectura persistente. Ejecutar completo en la misma conexión que 03. */
SET statement_timeout = '15min';

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
    OR table_name IN ('payment_methods') THEN 'GLOBAL_STRUCTURAL'
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
SELECT CASE WHEN
  to_regclass('miclub.users') IS NOT NULL
  AND to_regclass('miclub.clubs') IS NOT NULL
  AND to_regclass('miclub.user_club_memberships') IS NOT NULL
  AND (SELECT count(*) FROM miclub.users) <= 1
  AND NOT EXISTS (SELECT 1 FROM miclub.users WHERE id <> '821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid)
  AND (SELECT count(*) FROM miclub.clubs) <= 1
  AND NOT EXISTS (SELECT 1 FROM miclub.user_club_memberships WHERE user_id <> '821893b6-01a8-4e91-88f7-d869d8f3f8f4'::uuid)
  AND NOT EXISTS (
    SELECT 1 FROM reset_inventory i WHERE classification='UNKNOWN'
    AND (xpath('/row/c/text()',query_to_xml(format('select count(*) c from %I.%I',i.table_schema,i.table_name),false,true,'')))[1]::text::bigint > 0)
  THEN 'RESET PRECHECK: PASS' ELSE 'RESET PRECHECK: FAIL' END AS reset_precheck;

