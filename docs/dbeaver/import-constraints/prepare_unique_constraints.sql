/* SOLO LECTURA / PREPARACIÓN. Debe devolver cero filas en los dos primeros reportes.
   Si devuelve duplicados: DETENERSE; conservar IDs y conciliar manualmente. Nunca fusionar movimientos financieros sin autorización. */
BEGIN TRANSACTION READ ONLY;
SELECT club_id,external_id,count(*) quantity,array_agg(id ORDER BY created_at,id) ids,
       min(movement_date) first_date,max(movement_date) last_date,array_agg(DISTINCT source) sources
FROM miclub.movements WHERE external_id IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1;
SELECT club_id,external_id,count(*) quantity,array_agg(id ORDER BY created_at,id) ids,
       min(enrollment_date) first_date,max(enrollment_date) last_date,array_agg(DISTINCT source) sources
FROM miclub.enrollments WHERE external_id IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1;
SELECT table_name,count(*) total,count(*) FILTER(WHERE club_id IS NULL) missing_club,
 count(*) FILTER(WHERE source='google_sheets' AND external_id IS NULL) imported_missing_external_id
FROM (SELECT 'movements' table_name,club_id,source,external_id FROM miclub.movements
 UNION ALL SELECT 'enrollments',club_id,source,external_id FROM miclub.enrollments) q GROUP BY table_name;
-- Verifica si constraints/índices antiguos sostienen FKs antes de considerar su retiro en una fase futura.
SELECT dep_ns.nspname dependent_schema,dep.relname dependent_table,c.conname foreign_key,pg_get_constraintdef(c.oid,true) definition
FROM pg_constraint c JOIN pg_class dep ON dep.oid=c.conrelid JOIN pg_namespace dep_ns ON dep_ns.oid=dep.relnamespace
WHERE c.contype='f' AND c.confrelid IN ('miclub.movements'::regclass,'miclub.enrollments'::regclass);
ROLLBACK;
