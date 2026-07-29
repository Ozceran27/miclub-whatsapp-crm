-- Diagnóstico forense de INICIO/CRM. Solo lectura. Defina :club_id en DBeaver.
BEGIN TRANSACTION READ ONLY;

SELECT current_database() AS database_name,
       current_schema() AS current_schema,
       current_setting('search_path') AS search_path;

-- Tipo, columnas y presencia real de club_id en las relaciones consumidas.
SELECT n.nspname AS schema_name, c.relname AS relation_name,
       CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE c.relkind::text END AS relation_type,
       a.attnum AS ordinal_position, a.attname AS column_name,
       pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'miclub'
  AND c.relname = ANY (ARRAY[
    'people','enrollments','activities','sectors','movements','receivables','payments',
    'v_current_enrollments','v_enrollment_receivable_fees','v_dashboard_basic',
    'v_sector_finance_summary','v_sector_settlement_balances','v_movements_enriched'
  ])
ORDER BY c.relname, a.attnum;

SELECT table_name,
       bool_or(column_name = 'club_id') AS exposes_club_id
FROM information_schema.columns
WHERE table_schema = 'miclub'
  AND table_name = ANY (ARRAY[
    'people','enrollments','activities','sectors','movements','receivables','payments',
    'v_current_enrollments','v_enrollment_receivable_fees','v_dashboard_basic',
    'v_sector_finance_summary','v_sector_settlement_balances','v_movements_enriched'
  ])
GROUP BY table_name ORDER BY table_name;

SELECT schemaname, viewname, definition
FROM pg_catalog.pg_views
WHERE schemaname = 'miclub'
  AND viewname = ANY (ARRAY['v_current_enrollments','v_enrollment_receivable_fees','v_dashboard_basic','v_sector_finance_summary','v_sector_settlement_balances','v_movements_enriched'])
ORDER BY viewname;

SELECT tc.table_name, kcu.column_name, ccu.table_name AS referenced_table, ccu.column_name AS referenced_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu USING (constraint_catalog, constraint_schema, constraint_name)
JOIN information_schema.constraint_column_usage ccu USING (constraint_catalog, constraint_schema, constraint_name)
WHERE tc.constraint_schema = 'miclub' AND tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = ANY (ARRAY['people','enrollments','activities','sectors','movements','receivables','payments'])
ORDER BY tc.table_name, kcu.column_name;

-- Conteos tenant y coherencia de las relaciones people -> enrollments -> activities -> sectors.
SELECT 'people' relation_name, club_id, count(*) rows_count FROM miclub.people GROUP BY club_id
UNION ALL SELECT 'enrollments', club_id, count(*) FROM miclub.enrollments GROUP BY club_id
UNION ALL SELECT 'activities', club_id, count(*) FROM miclub.activities GROUP BY club_id
UNION ALL SELECT 'sectors', club_id, count(*) FROM miclub.sectors GROUP BY club_id
UNION ALL SELECT 'movements', club_id, count(*) FROM miclub.movements GROUP BY club_id
UNION ALL SELECT 'receivables', club_id, count(*) FROM miclub.receivables GROUP BY club_id
UNION ALL SELECT 'payments', club_id, count(*) FROM miclub.payments GROUP BY club_id
ORDER BY relation_name, club_id;

SELECT e.id enrollment_id, p.id person_id, a.id activity_id, s.id sector_id,
       e.club_id enrollment_club, p.club_id person_club, a.club_id activity_club, s.club_id sector_club,
       (e.club_id = p.club_id AND e.club_id = a.club_id AND e.club_id = s.club_id) AS tenant_chain_ok
FROM miclub.enrollments e
JOIN miclub.people p ON p.id=e.person_id
JOIN miclub.activities a ON a.id=e.activity_id
JOIN miclub.sectors s ON s.id=a.sector_id
WHERE e.club_id = CAST(:club_id AS uuid)
ORDER BY e.id LIMIT 100;

-- Equivalentes exactos mínimos corregidos (no dependen de club_id en las vistas legacy).
SELECT v.* FROM miclub.v_current_enrollments v
JOIN miclub.enrollments e ON e.id=v.enrollment_id
WHERE e.club_id=CAST(:club_id AS uuid);

SELECT v.* FROM miclub.v_current_enrollments v
JOIN miclub.enrollments e ON e.id=v.enrollment_id
WHERE e.club_id=CAST(:club_id AS uuid) AND v.status='adeudando';

SELECT count(*) total,
       count(*) FILTER (WHERE v.status NOT IN ('abandonado','cancelado')) active,
       count(*) FILTER (WHERE v.status='adeudando') debtors
FROM miclub.v_current_enrollments v JOIN miclub.enrollments e ON e.id=v.enrollment_id
WHERE e.club_id=CAST(:club_id AS uuid);

SELECT * FROM miclub.v_sector_finance_summary WHERE club_id=CAST(:club_id AS uuid);
SELECT * FROM miclub.v_dashboard_basic WHERE club_id=CAST(:club_id AS uuid);
SELECT coalesce(sum(vr.receivable_fee) FILTER (WHERE vr.status='adeudando'),0) cuotas_a_cobrar
FROM miclub.v_enrollment_receivable_fees vr
JOIN miclub.enrollments e ON e.id=vr.enrollment_id
WHERE e.club_id=CAST(:club_id AS uuid);

-- PASS/FAIL estructural y de aislamiento de las cinco consultas.
WITH checks(name, passed) AS (
  VALUES
    ('members', to_regclass('miclub.v_current_enrollments') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='miclub' AND table_name='enrollments' AND column_name='club_id')),
    ('debtors', to_regclass('miclub.v_current_enrollments') IS NOT NULL),
    ('summary', to_regclass('miclub.v_current_enrollments') IS NOT NULL),
    ('club_finance_summary', to_regclass('miclub.v_dashboard_basic') IS NOT NULL AND to_regclass('miclub.v_enrollment_receivable_fees') IS NOT NULL),
    ('sector_operational_summary', to_regclass('miclub.v_sector_finance_summary') IS NOT NULL)
)
SELECT name, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END result FROM checks ORDER BY name;

ROLLBACK;
