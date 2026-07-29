/*
  AUDITORÍA INTEGRAL PRE-ADMIN — SÓLO LECTURA
  Preconditions: PostgreSQL, schema miclub y rol con SELECT sobre catálogos/miclub.
  Ejecución: copiar completo en DBeaver. No hardcodea clubes ni modifica datos.
  Reversión: no aplica; la transacción es READ ONLY y termina en ROLLBACK.
  Interpretación: el reporte final debe contener únicamente PASS. Conservar además
  los result sets intermedios para reconciliar endpoints. Un FAIL requiere análisis
  y un script correctivo separado; no corregir datos desde este archivo.
*/
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';

-- A. Identidad del entorno (no expone secretos).
SELECT current_database() database_name, current_schema() schema_name,
       current_user database_user, current_setting('search_path') search_path,
       version() postgres_version;

-- B. Inventario de objetos y migraciones visibles.
SELECT table_type, table_name
FROM information_schema.tables
WHERE table_schema = 'miclub'
ORDER BY table_type, table_name;
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'miclub' AND column_name IN ('club_id','external_id','status','archived_at')
ORDER BY table_name, ordinal_position;
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='miclub' ORDER BY tablename,indexname;
SELECT n.nspname schema_name, p.proname function_name, pg_get_function_identity_arguments(p.oid) arguments
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='miclub' ORDER BY p.proname;
SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers WHERE trigger_schema='miclub' ORDER BY event_object_table,trigger_name;

-- C. Checks estructurales y tenant. to_regclass evita fallar si una tabla opcional no existe.
CREATE TEMP TABLE audit_checks(check_name text PRIMARY KEY, passed boolean, detail text) ON COMMIT DROP;
INSERT INTO audit_checks VALUES
('schema_miclub_exists', EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='miclub'), 'schema requerido'),
('clubs_exists', to_regclass('miclub.clubs') IS NOT NULL, 'tabla requerida'),
('users_exists', to_regclass('miclub.users') IS NOT NULL, 'tabla requerida'),
('people_exists', to_regclass('miclub.people') IS NOT NULL, 'tabla requerida'),
('memberships_exists', to_regclass('miclub.user_club_memberships') IS NOT NULL, 'tabla requerida'),
('movements_exists', to_regclass('miclub.movements') IS NOT NULL, 'tabla requerida'),
('import_batches_exists', to_regclass('miclub.import_batches') IS NOT NULL, 'tabla requerida'),
('import_errors_exists', to_regclass('miclub.import_errors') IS NOT NULL, 'tabla requerida'),
('audit_log_exists', to_regclass('miclub.audit_log') IS NOT NULL, 'tabla requerida'),
('crm_templates_exists', to_regclass('miclub.crm_message_templates') IS NOT NULL, 'tabla requerida'),
('crm_history_exists', to_regclass('miclub.crm_message_history') IS NOT NULL, 'tabla requerida');

-- Estas tablas son obligatorias en el schema actual; si no existen, detener aquí y
-- revisar el manifiesto de migraciones antes de continuar.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM audit_checks WHERE NOT passed) THEN
   RAISE EXCEPTION 'Faltan objetos requeridos; revisar el primer reporte de audit_checks';
 END IF;
END $$;

INSERT INTO audit_checks VALUES
('people_club_not_null', NOT EXISTS(SELECT 1 FROM miclub.people WHERE club_id IS NULL), 'people.club_id'),
('sectors_club_not_null', NOT EXISTS(SELECT 1 FROM miclub.sectors WHERE club_id IS NULL), 'sectors.club_id'),
('activities_club_not_null', NOT EXISTS(SELECT 1 FROM miclub.activities WHERE club_id IS NULL), 'activities.club_id'),
('enrollments_club_not_null', NOT EXISTS(SELECT 1 FROM miclub.enrollments WHERE club_id IS NULL), 'enrollments.club_id'),
('movements_club_not_null', NOT EXISTS(SELECT 1 FROM miclub.movements WHERE club_id IS NULL), 'movements.club_id'),
('payments_club_not_null', NOT EXISTS(SELECT 1 FROM miclub.payments WHERE club_id IS NULL), 'payments.club_id'),
('receivables_club_not_null', NOT EXISTS(SELECT 1 FROM miclub.receivables WHERE club_id IS NULL), 'receivables.club_id'),
('batches_club_not_null', NOT EXISTS(SELECT 1 FROM miclub.import_batches WHERE club_id IS NULL), 'import_batches.club_id'),
('crm_templates_club_not_null', NOT EXISTS(SELECT 1 FROM miclub.crm_message_templates WHERE club_id IS NULL), 'crm templates'),
('crm_history_club_not_null', NOT EXISTS(SELECT 1 FROM miclub.crm_message_history WHERE club_id IS NULL), 'crm history'),
('people_reference_existing_club', NOT EXISTS(SELECT 1 FROM miclub.people x LEFT JOIN miclub.clubs c ON c.id=x.club_id WHERE c.id IS NULL), 'orphan club FK'),
('movement_reference_existing_club', NOT EXISTS(SELECT 1 FROM miclub.movements x LEFT JOIN miclub.clubs c ON c.id=x.club_id WHERE c.id IS NULL), 'orphan club FK'),
('enrollment_person_same_club', NOT EXISTS(SELECT 1 FROM miclub.enrollments e JOIN miclub.people p ON p.id=e.person_id WHERE e.club_id IS DISTINCT FROM p.club_id), 'cross tenant FK'),
('enrollment_activity_same_club', NOT EXISTS(SELECT 1 FROM miclub.enrollments e JOIN miclub.activities a ON a.id=e.activity_id WHERE e.club_id IS DISTINCT FROM a.club_id), 'cross tenant FK'),
('activity_sector_same_club', NOT EXISTS(SELECT 1 FROM miclub.activities a JOIN miclub.sectors s ON s.id=a.sector_id WHERE a.club_id IS DISTINCT FROM s.club_id), 'cross tenant FK'),
('membership_role_same_club', NOT EXISTS(SELECT 1 FROM miclub.user_club_memberships m JOIN miclub.roles r ON r.id=m.role_id WHERE m.club_id IS DISTINCT FROM r.club_id), 'cross tenant role'),
('import_error_batch_same_club', NOT EXISTS(SELECT 1 FROM miclub.import_errors e JOIN miclub.import_batches b ON b.id=e.batch_id WHERE e.club_id IS DISTINCT FROM b.club_id), 'cross tenant batch'),
('movement_status_valid', NOT EXISTS(SELECT 1 FROM miclub.movements WHERE upper(operational_status::text) NOT IN ('COMPLETADO','PENDIENTE','ANULADO','CANCELADO')), 'enum/codes conocidos');

-- D. Duplicados de claves externas no vacías (el resultado esperado es cero filas).
SELECT 'people' entity, club_id, external_id, count(*) duplicates FROM miclub.people
 WHERE nullif(btrim(external_id),'') IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1
UNION ALL
SELECT 'activities', club_id, external_id, count(*) FROM miclub.activities
 WHERE nullif(btrim(external_id),'') IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1
UNION ALL
SELECT 'enrollments', club_id, external_id, count(*) FROM miclub.enrollments
 WHERE nullif(btrim(external_id),'') IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1
UNION ALL
SELECT 'movements', club_id, external_id, count(*) FROM miclub.movements
 WHERE nullif(btrim(external_id),'') IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1;

INSERT INTO audit_checks
SELECT 'external_ids_unique', NOT EXISTS (
 SELECT 1 FROM (
  SELECT club_id,external_id FROM miclub.people WHERE nullif(btrim(external_id),'') IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1
  UNION ALL SELECT club_id,external_id FROM miclub.enrollments WHERE nullif(btrim(external_id),'') IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1
  UNION ALL SELECT club_id,external_id FROM miclub.movements WHERE nullif(btrim(external_id),'') IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1
 ) d), 'unicidad por club para ON CONFLICT';

-- E. Resultados independientes para comparar INICIO y ECONOMÍA.
-- Estado ordinario: sólo COMPLETADO. Intervalo mensual Buenos Aires [inicio, fin).
WITH bounds AS (
 SELECT (date_trunc('month', now() AT TIME ZONE 'America/Argentina/Buenos_Aires') AT TIME ZONE 'America/Argentina/Buenos_Aires') start_at,
        ((date_trunc('month', now() AT TIME ZONE 'America/Argentina/Buenos_Aires') + interval '1 month') AT TIME ZONE 'America/Argentina/Buenos_Aires') end_at
)
SELECT m.club_id,
 coalesce(sum(abs(m.amount)) FILTER (WHERE upper(m.movement_type::text)='INGRESOS'),0) income,
 coalesce(sum(abs(m.amount)) FILTER (WHERE upper(m.movement_type::text)='EGRESOS'),0) expenses,
 coalesce(sum(CASE WHEN upper(m.movement_type::text)='INGRESOS' THEN abs(m.amount) ELSE -abs(m.amount) END),0) balance
FROM miclub.movements m CROSS JOIN bounds b
WHERE upper(m.operational_status::text)='COMPLETADO' AND m.movement_date>=b.start_at AND m.movement_date<b.end_at
GROUP BY m.club_id ORDER BY m.club_id;

-- Excepción aprobada: pendientes, ingresos suman y egresos restan.
SELECT club_id, count(*) movement_count,
 coalesce(sum(CASE WHEN upper(movement_type::text)='INGRESOS' THEN abs(amount) ELSE -abs(amount) END),0) pending_balance
FROM miclub.movements WHERE upper(operational_status::text)='PENDIENTE' GROUP BY club_id ORDER BY club_id;
SELECT club_id, upper(operational_status::text) status, count(*) records, sum(abs(amount)) amount
FROM miclub.movements GROUP BY club_id,upper(operational_status::text) ORDER BY club_id,status;
SELECT club_id, count(*) people FROM miclub.people GROUP BY club_id ORDER BY club_id;
SELECT club_id, status::text, count(*) enrollments FROM miclub.enrollments GROUP BY club_id,status::text ORDER BY club_id,status::text;
SELECT club_id, count(*) payments, coalesce(sum(amount),0) amount FROM miclub.payments GROUP BY club_id ORDER BY club_id;
SELECT club_id, count(*) receivables, coalesce(sum(amount),0) amount FROM miclub.receivables GROUP BY club_id ORDER BY club_id;

-- F. CRM y MIGRACIÓN: conteos tenant-scoped, finalización y errores.
SELECT club_id,status,count(*) messages FROM miclub.crm_message_history GROUP BY club_id,status ORDER BY club_id,status;
SELECT club_id,count(*) templates FROM miclub.crm_message_templates WHERE archived_at IS NULL GROUP BY club_id ORDER BY club_id;
SELECT club_id,status,count(*) batches,min(started_at) oldest,max(started_at) newest
FROM miclub.import_batches GROUP BY club_id,status ORDER BY club_id,status;
SELECT b.club_id,count(*) errors FROM miclub.import_errors e JOIN miclub.import_batches b ON b.id=e.batch_id GROUP BY b.club_id ORDER BY b.club_id;
INSERT INTO audit_checks
SELECT 'batches_finalized', NOT EXISTS (
 SELECT 1 FROM miclub.import_batches
 WHERE status IN ('running','processing') AND started_at < now()-interval '2 hours'
), 'ningún batch activo por más de 2 horas';

-- G. Vistas sin club_id y definiciones sospechosas de agregación global.
SELECT table_name AS view_without_club_id
FROM information_schema.views v
WHERE v.table_schema='miclub' AND NOT EXISTS (
 SELECT 1 FROM information_schema.columns c WHERE c.table_schema=v.table_schema AND c.table_name=v.table_name AND c.column_name='club_id'
) ORDER BY table_name;
INSERT INTO audit_checks
SELECT 'operational_views_expose_club_id', NOT EXISTS (
 SELECT 1 FROM information_schema.views v WHERE v.table_schema='miclub'
 AND v.table_name IN ('v_dashboard_basic','v_movements_enriched','v_receivables_effective')
 AND NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema=v.table_schema AND c.table_name=v.table_name AND c.column_name='club_id')
), 'vistas consumidas por la aplicación';

-- H. Reporte final. Debe contener sólo PASS; summary debe ser PASS.
SELECT check_name, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END result, detail
FROM audit_checks ORDER BY passed,check_name;
SELECT CASE WHEN bool_and(passed) THEN 'PASS' ELSE 'FAIL' END overall_result,
       count(*) FILTER (WHERE passed) passed_checks,
       count(*) FILTER (WHERE NOT passed) failed_checks,
       count(*) total_checks
FROM audit_checks;
ROLLBACK;
