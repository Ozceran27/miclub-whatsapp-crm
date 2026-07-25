/* SOLO LECTURA. Resultado esperado: dos índices UNIQUE, válidos y parciales; cero duplicados y cero imports sin external_id. */
SELECT t.relname table_name,i.relname index_name,ix.indisunique,ix.indisvalid,
 pg_get_expr(ix.indpred,ix.indrelid) predicate,pg_get_indexdef(ix.indexrelid) definition
FROM pg_index ix JOIN pg_class t ON t.oid=ix.indrelid JOIN pg_class i ON i.oid=ix.indexrelid
WHERE ix.indexrelid IN (to_regclass('miclub.movements_club_external_id_key'),to_regclass('miclub.enrollments_club_external_id_key'));
SELECT enumlabel FROM pg_enum WHERE enumtypid='miclub.import_batch_status'::regtype ORDER BY enumsortorder;
SELECT 'movements_duplicates' check_name,count(*) failures FROM (SELECT 1 FROM miclub.movements WHERE external_id IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1) d
UNION ALL SELECT 'enrollments_duplicates',count(*) FROM (SELECT 1 FROM miclub.enrollments WHERE external_id IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1) d
UNION ALL SELECT 'movements_imported_without_key',count(*) FROM miclub.movements WHERE source='google_sheets' AND external_id IS NULL
UNION ALL SELECT 'enrollments_imported_without_key',count(*) FROM miclub.enrollments WHERE source='google_sheets' AND external_id IS NULL;
-- Prueba de inferencia sin persistir: si falta el índice compatible PostgreSQL falla aquí con 42P10.
BEGIN;
EXPLAIN INSERT INTO miclub.movements(club_id,external_id,movement_date,movement_type,concept,amount,financial_status,operational_status,source)
 SELECT club_id,'__constraint_validation__',current_date,'INGRESOS','validation',0,'pagado','COMPLETADO','validation' FROM miclub.clubs LIMIT 1
 ON CONFLICT (club_id,external_id) WHERE external_id IS NOT NULL DO UPDATE SET concept=excluded.concept;
EXPLAIN INSERT INTO miclub.enrollments(club_id,external_id,person_id,activity_id,fee_amount,status,source)
 SELECT e.club_id,'__constraint_validation__',e.person_id,e.activity_id,0,e.status,'validation' FROM miclub.enrollments e LIMIT 1
 ON CONFLICT (club_id,external_id) WHERE external_id IS NOT NULL DO UPDATE SET fee_amount=excluded.fee_amount;
ROLLBACK;
