/* SOLO LECTURA. Comparar fingerprint y totales exactamente con 01. */
BEGIN TRANSACTION READ ONLY;
WITH target AS (SELECT id FROM miclub.clubs WHERE is_active AND lower(btrim(name))='miclub'), checks AS (
 SELECT 'identity.target_club' check_name,(SELECT count(*) FROM target)=1 ok
 UNION ALL SELECT 'identity.fernando', (SELECT count(DISTINCT u.id)=1 FROM miclub.users u JOIN miclub.people p ON p.user_id=u.id JOIN target t ON t.id=p.club_id WHERE u.is_active AND lower(btrim(p.first_name))='fernando' AND lower(btrim(p.last_name))='ramos')
 UNION ALL SELECT 'identity.director',(SELECT count(*)=1 FROM miclub.user_club_memberships m JOIN miclub.roles r ON r.id=m.role_id AND r.club_id=m.club_id JOIN target t ON t.id=m.club_id WHERE m.status='active' AND upper(r.code)='DIRECTOR')
 UNION ALL SELECT 'tenant.people',NOT EXISTS(SELECT FROM miclub.people WHERE club_id IS NULL)
 UNION ALL SELECT 'tenant.sectors',NOT EXISTS(SELECT FROM miclub.sectors WHERE club_id IS NULL)
 UNION ALL SELECT 'tenant.activities',NOT EXISTS(SELECT FROM miclub.activities WHERE club_id IS NULL)
 UNION ALL SELECT 'tenant.enrollments',NOT EXISTS(SELECT FROM miclub.enrollments WHERE club_id IS NULL)
 UNION ALL SELECT 'tenant.movements',NOT EXISTS(SELECT FROM miclub.movements WHERE club_id IS NULL)
 UNION ALL SELECT 'tenant.imports',NOT EXISTS(SELECT FROM miclub.import_batches WHERE club_id IS NULL)
 UNION ALL SELECT 'activity_sector',NOT EXISTS(SELECT FROM miclub.activities a LEFT JOIN miclub.sectors s ON (s.id,s.club_id)=(a.sector_id,a.club_id) WHERE s.id IS NULL)
 UNION ALL SELECT 'enrollment_person',NOT EXISTS(SELECT FROM miclub.enrollments e LEFT JOIN miclub.people p ON (p.id,p.club_id)=(e.person_id,e.club_id) WHERE p.id IS NULL)
 UNION ALL SELECT 'enrollment_activity',NOT EXISTS(SELECT FROM miclub.enrollments e LEFT JOIN miclub.activities a ON (a.id,a.club_id)=(e.activity_id,e.club_id) WHERE a.id IS NULL)
 UNION ALL SELECT 'movement_sector',NOT EXISTS(SELECT FROM miclub.movements m LEFT JOIN miclub.sectors s ON (s.id,s.club_id)=(m.sector_id,m.club_id) WHERE m.sector_id IS NOT NULL AND s.id IS NULL)
 UNION ALL SELECT 'people_dni_unique',NOT EXISTS(SELECT club_id,normalized_dni FROM miclub.people WHERE normalized_dni IS NOT NULL GROUP BY 1,2 HAVING count(*)>1)
 UNION ALL SELECT 'movement_external_unique',NOT EXISTS(SELECT club_id,external_id FROM miclub.movements GROUP BY 1,2 HAVING count(*)>1)
 UNION ALL SELECT 'movement_required_catalogs',NOT EXISTS(SELECT FROM miclub.movements WHERE category_id IS NULL OR movement_type IS NULL OR operational_status IS NULL)
)
SELECT *,CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END status FROM checks
UNION ALL SELECT 'BACKFILL VALIDATION',bool_and(ok),CASE WHEN bool_and(ok) THEN 'PASS' ELSE 'FAIL' END FROM checks;
SELECT count(*) movement_count,sum(amount) total,sum(amount) FILTER(WHERE movement_type='CAPITAL') capital,
sum(amount) FILTER(WHERE movement_type='INGRESOS') ingresos,sum(amount) FILTER(WHERE movement_type='EGRESOS') egresos,
md5(string_agg(id::text||'|'||amount::text||'|'||movement_date::text||'|'||external_id,';' ORDER BY id)) immutable_fingerprint FROM miclub.movements;
SELECT date_trunc('month',movement_date) month,movement_type,count(*),sum(amount) FROM miclub.movements GROUP BY 1,2 ORDER BY 1,2;
SELECT count(*) enrollments,sum(fee_amount) cuotas FROM miclub.enrollments;
SELECT count(*) receivables,sum(amount) debt FROM miclub.receivables WHERE status NOT IN ('pagado','cancelado');
ROLLBACK;
