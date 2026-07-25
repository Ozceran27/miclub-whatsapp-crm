/* SOLO LECTURA. Ejecutar completo en DBeaver antes de preparar la migración.
   No presupone que `members` exista: descubre la tabla física y reporta el schema real. */
SELECT current_database() database_name, current_user, current_schema(), version();

-- Tablas candidatas y columnas (incluye nullability, default y tipo real).
SELECT c.table_schema, c.table_name, c.column_name, c.ordinal_position,
       c.data_type, c.udt_schema, c.udt_name, c.is_nullable, c.column_default
FROM information_schema.columns c
WHERE c.table_schema NOT IN ('pg_catalog','information_schema')
  AND c.table_name IN ('movements','enrollments','members','people','activities','sectors','import_batches','import_errors',
                       'movement_categories','payment_methods','payments','instructors','operational_balances','sheet_metric_snapshots')
ORDER BY c.table_schema,c.table_name,c.ordinal_position;

-- PK, UNIQUE, EXCLUDE, FK y CHECK con definición completa y columnas ordenadas.
SELECT n.nspname schema_name, rel.relname table_name, con.conname constraint_name,
       con.contype constraint_type, pg_get_constraintdef(con.oid, true) definition,
       refn.nspname referenced_schema, refrel.relname referenced_table,
       string_agg(att.attname, ', ' ORDER BY keys.ordinality) FILTER (WHERE att.attname IS NOT NULL) constrained_columns
FROM pg_constraint con
JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace n ON n.oid=rel.relnamespace
LEFT JOIN LATERAL unnest(con.conkey) WITH ORDINALITY keys(attnum,ordinality) ON true
LEFT JOIN pg_attribute att ON att.attrelid=rel.oid AND att.attnum=keys.attnum
LEFT JOIN pg_class refrel ON refrel.oid=con.confrelid LEFT JOIN pg_namespace refn ON refn.oid=refrel.relnamespace
WHERE rel.relname IN ('movements','enrollments','members','people','activities','sectors','import_batches','import_errors',
                      'movement_categories','payment_methods','payments','instructors','operational_balances','sheet_metric_snapshots')
GROUP BY n.nspname,rel.relname,con.conname,con.contype,con.oid,refn.nspname,refrel.relname
ORDER BY 1,2,3;

-- Vista information_schema independiente para contrastar el catálogo PostgreSQL.
SELECT tc.table_schema,tc.table_name,tc.constraint_name,tc.constraint_type,ccu.column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.constraint_column_usage ccu
 ON ccu.constraint_schema=tc.constraint_schema AND ccu.constraint_name=tc.constraint_name
WHERE tc.table_name IN ('movements','enrollments','members','people','activities','sectors','import_batches','import_errors')
ORDER BY 1,2,3,ccu.column_name;

-- Todo índice: UNIQUE/no UNIQUE, parcial, válido, predicado y definición completa.
SELECT n.nspname schema_name,t.relname table_name,i.relname index_name,ix.indisunique,ix.indisprimary,
       ix.indisexclusion,ix.indisvalid,pg_get_expr(ix.indpred,ix.indrelid) predicate,
       pg_get_indexdef(ix.indexrelid) definition
FROM pg_index ix JOIN pg_class t ON t.oid=ix.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_class i ON i.oid=ix.indexrelid
WHERE t.relname IN ('movements','enrollments','members','people','activities','sectors','import_batches','import_errors',
                    'movement_categories','payment_methods','payments','instructors','operational_balances','sheet_metric_snapshots')
ORDER BY 1,2,3;

SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes
WHERE tablename IN ('movements','enrollments','members','people','activities','sectors') ORDER BY 1,2,3;

-- Duplicados que bloquearían las claves autoritativas. NULL se excluye deliberadamente: registros manuales pueden no tener external_id.
SELECT 'movements' entity,club_id,external_id,count(*) quantity,
       array_agg(id ORDER BY created_at,id) ids,min(movement_date) first_date,max(movement_date) last_date,
       array_agg(DISTINCT source) sources
FROM miclub.movements WHERE external_id IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1;
SELECT 'enrollments' entity,club_id,external_id,count(*) quantity,
       array_agg(id ORDER BY created_at,id) ids,min(enrollment_date) first_date,max(enrollment_date) last_date,
       array_agg(DISTINCT source) sources
FROM miclub.enrollments WHERE external_id IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1;

-- Backfill/semántica de origen. No inventa identificadores.
SELECT 'movements' entity,count(*) total,count(*) FILTER(WHERE club_id IS NULL) missing_club,
 count(*) FILTER(WHERE external_id IS NULL) missing_external_id,count(*) FILTER(WHERE source='google_sheets' AND external_id IS NULL) imported_missing_external_id
FROM miclub.movements
UNION ALL SELECT 'enrollments',count(*),count(*) FILTER(WHERE club_id IS NULL),count(*) FILTER(WHERE external_id IS NULL),
 count(*) FILTER(WHERE source='google_sheets' AND external_id IS NULL) FROM miclub.enrollments;

-- UPSERT esperado frente al índice compatible (las dos filas deben devolver COMPATIBLE).
WITH expected(entity,key,predicate) AS (VALUES
 ('movements','club_id, external_id','(external_id IS NOT NULL)'),
 ('enrollments','club_id, external_id','(external_id IS NOT NULL)'))
SELECT e.*,coalesce(i.indexname,'NO ENCONTRADO') matching_index,
 CASE WHEN i.indexname IS NULL THEN 'INCOMPATIBLE' ELSE 'COMPATIBLE' END result
FROM expected e LEFT JOIN pg_indexes i ON i.schemaname='miclub' AND i.tablename=e.entity
 AND regexp_replace(lower(i.indexdef),'\\s','','g') LIKE '%unique%('||replace(e.key,' ','')||')%'
ORDER BY e.entity;
