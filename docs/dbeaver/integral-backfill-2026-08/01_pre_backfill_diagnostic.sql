/* SOLO LECTURA. Exportar todos los result sets. No ejecuta backfill. */
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='15min'; SET LOCAL lock_timeout='2s';

SELECT current_database(), current_user, now(), version();
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns WHERE table_schema='miclub' ORDER BY 1,ordinal_position;
SELECT 'clubs' domain,count(*) total,count(*) FILTER(WHERE is_active) active FROM miclub.clubs
UNION ALL SELECT 'users',count(*),count(*) FILTER(WHERE is_active) FROM miclub.users;
SELECT c.id,c.code,c.name,c.is_active,
 (SELECT count(*) FROM miclub.people p WHERE p.club_id=c.id) people,
 (SELECT count(*) FROM miclub.movements m WHERE m.club_id=c.id) movements,
 (SELECT count(*) FROM miclub.enrollments e WHERE e.club_id=c.id) enrollments
FROM miclub.clubs c ORDER BY c.created_at;
SELECT u.id user_id,u.email,u.is_active,p.id person_id,p.first_name,p.last_name,p.club_id,
 ucm.id authorization_id,ucm.status membership_status,r.code role_code,ucm.permissions
FROM miclub.users u LEFT JOIN miclub.people p ON p.user_id=u.id
LEFT JOIN miclub.user_club_memberships ucm ON ucm.user_id=u.id AND ucm.club_id=p.club_id
LEFT JOIN miclub.roles r ON r.id=ucm.role_id AND r.club_id=ucm.club_id
WHERE lower(btrim(p.first_name))='fernando' AND lower(btrim(p.last_name))='ramos';
SELECT r.club_id,r.code,r.name,count(ucm.id) memberships FROM miclub.roles r
LEFT JOIN miclub.user_club_memberships ucm ON ucm.role_id=r.id GROUP BY r.id ORDER BY r.code;

-- Cobertura tenant e IDs de club inválidos, para toda tabla física con club_id.
CREATE TEMP TABLE diagnostic_tenant(table_name text,total bigint,null_club bigint,invalid_club bigint);
DO $$ DECLARE t record; BEGIN FOR t IN SELECT table_name FROM information_schema.columns
 WHERE table_schema='miclub' AND column_name='club_id' LOOP
 EXECUTE format('INSERT INTO diagnostic_tenant SELECT %L,count(*),count(*) FILTER(WHERE club_id IS NULL),count(*) FILTER(WHERE club_id IS NOT NULL AND NOT EXISTS(SELECT FROM miclub.clubs c WHERE c.id=x.club_id)) FROM miclub.%I x',t.table_name,t.table_name);
END LOOP; END $$;
SELECT * FROM diagnostic_tenant ORDER BY table_name;

SELECT id,club_id,code,name,is_system,status,archived_at FROM miclub.sectors ORDER BY club_id,name;
SELECT club_id,lower(btrim(code)) key,count(*) FROM miclub.sectors WHERE code IS NOT NULL GROUP BY 1,2 HAVING count(*)>1
UNION ALL SELECT club_id,lower(btrim(name)),count(*) FROM miclub.sectors GROUP BY 1,2 HAVING count(*)>1;
SELECT a.id,a.club_id,a.code,a.name,a.sector_id,s.name sector,a.manager_person_id,a.instructor_id,a.status,
 a.club_commission_percent,a.instructor_commission_percent
FROM miclub.activities a LEFT JOIN miclub.sectors s ON s.id=a.sector_id ORDER BY a.club_id,a.name;
SELECT club_id,sector_id,lower(btrim(name)),coalesce(lower(btrim(modality)),'') modality,count(*)
FROM miclub.activities GROUP BY 1,2,3,4 HAVING count(*)>1;

SELECT 'DNI' key,club_id,normalized_dni value,count(*) FROM miclub.people WHERE normalized_dni IS NOT NULL GROUP BY 1,2 HAVING count(*)>1
UNION ALL SELECT 'EMAIL',club_id,lower(btrim(email)),count(*) FROM miclub.people WHERE nullif(btrim(email),'') IS NOT NULL GROUP BY 1,2 HAVING count(*)>1
UNION ALL SELECT 'PHONE',club_id,regexp_replace(coalesce(normalized_phone,phone),'[^0-9]','','g'),count(*) FROM miclub.people
 WHERE nullif(regexp_replace(coalesce(normalized_phone,phone),'[^0-9]','','g'),'') IS NOT NULL GROUP BY 1,2 HAVING count(*)>1;

SELECT 'enrollments' domain,count(*) total,count(*) FILTER(WHERE club_id IS NULL) no_club,
 count(*) FILTER(WHERE person_id IS NULL) no_person,count(*) FILTER(WHERE activity_id IS NULL) no_activity,
 count(*) FILTER(WHERE a.id IS NULL OR p.id IS NULL) orphan_or_cross_tenant
FROM miclub.enrollments e LEFT JOIN miclub.activities a ON (a.id,a.club_id)=(e.activity_id,e.club_id)
LEFT JOIN miclub.people p ON (p.id,p.club_id)=(e.person_id,e.club_id);
SELECT e.id,e.external_id,e.club_id,e.person_id,e.activity_id,a.sector_id
FROM miclub.enrollments e LEFT JOIN miclub.activities a ON a.id=e.activity_id
WHERE e.club_id IS NULL OR a.id IS NULL OR e.person_id IS NULL;

SELECT 'movements' domain,count(*) total,count(*) FILTER(WHERE club_id IS NULL) no_club,
 count(*) FILTER(WHERE sector_id IS NULL) no_sector,count(*) FILTER(WHERE category_id IS NULL) no_category,
 count(*) FILTER(WHERE payment_method_id IS NULL) no_payment_method,count(*) FILTER(WHERE activity_id IS NULL) no_activity
FROM miclub.movements;
SELECT club_id,external_id,count(*) FROM miclub.movements GROUP BY 1,2 HAVING count(*)>1;
SELECT 'employees' domain,count(*) total,count(*) FILTER(WHERE club_id IS NULL) no_club,
 count(*) FILTER(WHERE person_id IS NULL) no_person,
 count(*) FILTER(WHERE membership_id IS NULL AND nullif(btrim(position),'') IS NULL) no_labor_role FROM miclub.employees
UNION ALL SELECT 'instructors',count(*),count(*) FILTER(WHERE club_id IS NULL),count(*) FILTER(WHERE person_id IS NULL),0 FROM miclub.instructors;
SELECT person_id,club_id,count(*) FROM miclub.employees GROUP BY 1,2 HAVING count(*)>1;
SELECT person_id,club_id,count(*) FROM miclub.instructors GROUP BY 1,2 HAVING count(*)>1;
SELECT 'tasks' domain,count(*) total,count(*) FILTER(WHERE club_id IS NULL) no_club,
 count(*) FILTER(WHERE assigned_to_user_id IS NULL) no_responsible FROM miclub.tasks
UNION ALL SELECT 'approval_requests',count(*),count(*) FILTER(WHERE club_id IS NULL),count(*) FILTER(WHERE requested_by_user_id IS NULL) FROM miclub.approval_requests;
SELECT 'import_batches' domain,count(*) total,count(*) FILTER(WHERE club_id IS NULL) no_club FROM miclub.import_batches
UNION ALL SELECT 'import_errors',count(*),count(*) FILTER(WHERE club_id IS NULL) FROM miclub.import_errors;
SELECT source_table,count(*) FILTER(WHERE nullif(btrim(source_row),'') IS NULL) incomplete_source_rows FROM miclub.import_errors GROUP BY 1;
SELECT 'unresolved_category' kind,coalesce(source_payload->>'category',concept) legacy_value,count(*) FROM miclub.movements WHERE category_id IS NULL GROUP BY 2
UNION ALL SELECT 'unresolved_payment_method',source_payload->>'payment_method',count(*) FROM miclub.movements WHERE payment_method_id IS NULL GROUP BY 2;

-- Baseline financiero inmutable: guardar ambos result sets para comparar en 14.
SELECT count(*) movement_count,sum(amount) total,
 sum(amount) FILTER(WHERE movement_type='CAPITAL') capital,
 sum(amount) FILTER(WHERE movement_type='INGRESOS') ingresos,
 sum(amount) FILTER(WHERE movement_type='EGRESOS') egresos,
 md5(string_agg(id::text||'|'||amount::text||'|'||movement_date::text||'|'||external_id,';' ORDER BY id)) immutable_fingerprint
FROM miclub.movements;
SELECT date_trunc('month',movement_date) month,movement_type,count(*),sum(amount) FROM miclub.movements GROUP BY 1,2 ORDER BY 1,2;
SELECT count(*) enrollments,sum(fee_amount) cuotas FROM miclub.enrollments;
SELECT count(*) receivables,sum(amount) debt FROM miclub.receivables WHERE status NOT IN ('pagado','cancelado');

SELECT CASE WHEN active_clubs=1 AND target_clubs=1 THEN 'PASS' ELSE 'FAIL' END identity_tenant,
 CASE WHEN fernando=1 THEN 'PASS' ELSE 'FAIL' END fernando_identity,
 CASE WHEN director=1 THEN 'PASS' ELSE 'FAIL' END director_membership,
 CASE WHEN invalid_tenant=0 THEN 'PASS' ELSE 'FAIL' END foreign_keys,
 CASE WHEN null_tenant=0 THEN 'PASS' ELSE 'WARNING' END tenant_backfill
FROM (SELECT count(*) FILTER(WHERE is_active) active_clubs,count(*) FILTER(WHERE is_active AND lower(btrim(name))='miclub') target_clubs FROM miclub.clubs)c
CROSS JOIN (SELECT count(DISTINCT u.id) fernando FROM miclub.users u JOIN miclub.people p ON p.user_id=u.id WHERE lower(btrim(p.first_name))='fernando' AND lower(btrim(p.last_name))='ramos')f
CROSS JOIN (SELECT count(*) director FROM miclub.user_club_memberships m JOIN miclub.roles r ON r.id=m.role_id AND r.club_id=m.club_id JOIN miclub.clubs c ON c.id=m.club_id WHERE m.status='active' AND upper(r.code)='DIRECTOR' AND lower(btrim(c.name))='miclub')d
CROSS JOIN (SELECT coalesce(sum(invalid_club),0) invalid_tenant,coalesce(sum(null_club),0) null_tenant FROM diagnostic_tenant)t;
ROLLBACK;
