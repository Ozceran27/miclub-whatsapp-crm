-- Auditoría forense del Dry-Run. SOLO LECTURA; no contiene DDL ni DML.
-- Ejecutar completo en la misma conexión de DBeaver usada para validar producción.
BEGIN TRANSACTION READ ONLY;

SELECT current_database() database_name, current_schema() schema_name,
       current_user database_user, current_setting('search_path') search_path,
       version() postgres_version;

-- Batch reportado y sus errores (el UUID no es un club y no modifica datos).
SELECT b.*, extract(epoch FROM (coalesce(b.finished_at, now()) - b.started_at)) * 1000 duration_ms
FROM miclub.import_batches b
WHERE b.id = '381daabf-2626-469a-b7d6-7b58dccda273'::uuid;

SELECT coalesce(p.raw_payload->>'code', 'ROW_IMPORT_ERROR') error_code,
       left(p.error_message, 500) message,
       split_part(p.source_row, ':', 1) sheet, p.source_table entity,
       count(*) quantity
FROM miclub.import_errors p
WHERE p.batch_id = '381daabf-2626-469a-b7d6-7b58dccda273'::uuid
GROUP BY 1,2,3,4 ORDER BY quantity DESC;

-- Definición completa de índices y constraints de las entidades importadas.
SELECT n.nspname schema_name, t.relname table_name, i.relname index_name,
       ix.indisunique, ix.indisvalid, pg_get_expr(ix.indpred, ix.indrelid) predicate,
       pg_get_indexdef(ix.indexrelid) definition
FROM pg_index ix JOIN pg_class t ON t.oid=ix.indrelid
JOIN pg_class i ON i.oid=ix.indexrelid JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='miclub' AND t.relname IN ('movements','enrollments') ORDER BY 2,3;

SELECT conrelid::regclass table_name, conname, contype, pg_get_constraintdef(oid) definition
FROM pg_constraint WHERE connamespace='miclub'::regnamespace
AND conrelid IN ('miclub.movements'::regclass,'miclub.enrollments'::regclass) ORDER BY 1,2;

-- Calidad e identidad tenant-scoped; NULL manual no colisiona con el importador.
SELECT 'movements' entity, count(*) total, count(*) FILTER (WHERE external_id IS NULL) external_id_null,
       count(*) FILTER (WHERE club_id IS NULL) club_id_null, count(DISTINCT club_id) clubs
FROM miclub.movements
UNION ALL SELECT 'enrollments', count(*), count(*) FILTER (WHERE external_id IS NULL),
       count(*) FILTER (WHERE club_id IS NULL), count(DISTINCT club_id) FROM miclub.enrollments;

SELECT 'movements' entity, club_id, external_id, count(*) duplicates
FROM miclub.movements WHERE external_id IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1
UNION ALL
SELECT 'enrollments', club_id, external_id, count(*)
FROM miclub.enrollments WHERE external_id IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1;

SELECT 'movements' entity, club_id, count(*) records FROM miclub.movements GROUP BY club_id
UNION ALL SELECT 'enrollments', club_id, count(*) FROM miclub.enrollments GROUP BY club_id ORDER BY 1,2;

-- Comparación automática con los dos targets exactos usados por el importador.
WITH required(entity, table_name) AS (VALUES ('MOVEMENTS','movements'),('ENROLLMENTS','enrollments')),
checks AS (
 SELECT r.entity, '(club_id, external_id) WHERE external_id IS NOT NULL' conflict_target,
   EXISTS (SELECT 1 FROM pg_index x JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
     WHERE n.nspname='miclub' AND t.relname=r.table_name AND x.indisunique AND x.indisvalid AND x.indisready
       AND pg_get_indexdef(x.indexrelid) ~* '\\(club_id, external_id\\) WHERE \\(external_id IS NOT NULL\\)') compatible
 FROM required r)
SELECT entity, conflict_target, CASE WHEN compatible THEN 'PASS' ELSE 'FAIL' END compatible_constraint FROM checks
UNION ALL SELECT 'FINAL', 'todos los conflict targets', CASE WHEN bool_and(compatible) THEN 'PASS' ELSE 'FAIL' END FROM checks;

ROLLBACK;
