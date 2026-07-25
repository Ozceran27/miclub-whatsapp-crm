/* Validación final SOLO LECTURA. Cada fila debe indicar PASS. */
WITH official AS (
 SELECT u.id user_id,p.id person_id,m.id membership_id,c.id club_id,r.code,m.status
 FROM miclub.users u JOIN miclub.user_club_memberships m ON m.user_id=u.id
 JOIN miclub.clubs c ON c.id=m.club_id JOIN miclub.roles r ON r.id=m.role_id AND r.club_id=m.club_id
 JOIN miclub.people p ON p.user_id=u.id AND p.club_id=m.club_id
 WHERE lower(u.email)='miclub.posadas@gmail.com' AND p.normalized_dni='35004264' AND lower(c.name)='miclub'
), checks AS (
 SELECT 'official_identity_chain' check_name,(SELECT count(*)=1 FROM official WHERE status='active' AND upper(code)='DIRECTOR') passed
 UNION ALL SELECT 'movements_have_club',NOT EXISTS(SELECT 1 FROM miclub.movements WHERE club_id IS NULL)
 UNION ALL SELECT 'enrollments_have_club',NOT EXISTS(SELECT 1 FROM miclub.enrollments WHERE club_id IS NULL)
 UNION ALL SELECT 'sectors_have_club',NOT EXISTS(SELECT 1 FROM miclub.sectors WHERE club_id IS NULL)
 UNION ALL SELECT 'activities_have_club',NOT EXISTS(SELECT 1 FROM miclub.activities WHERE club_id IS NULL)
 UNION ALL SELECT 'batches_have_club',NOT EXISTS(SELECT 1 FROM miclub.import_batches WHERE club_id IS NULL)
 UNION ALL SELECT 'snapshots_have_club',NOT EXISTS(SELECT 1 FROM miclub.sheet_metric_snapshots WHERE club_id IS NULL)
 UNION ALL SELECT 'enrollment_person_same_club',NOT EXISTS(SELECT 1 FROM miclub.enrollments e JOIN miclub.people p ON p.id=e.person_id WHERE e.club_id IS DISTINCT FROM p.club_id)
 UNION ALL SELECT 'enrollment_activity_same_club',NOT EXISTS(SELECT 1 FROM miclub.enrollments e JOIN miclub.activities a ON a.id=e.activity_id WHERE e.club_id IS DISTINCT FROM a.club_id)
)
SELECT check_name,CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END result FROM checks ORDER BY passed,check_name;

/* Totales financieros autoritativos para comparar con el snapshot previo. No altera montos/fechas. */
SELECT club_id,count(*) movement_count,
 sum(amount) FILTER(WHERE upper(type)='INGRESOS') ingresos,
 sum(amount) FILTER(WHERE upper(type)='EGRESOS') egresos
FROM miclub.movements GROUP BY club_id ORDER BY club_id;
SELECT club_id,count(*) FROM miclub.enrollments GROUP BY club_id ORDER BY club_id;
SELECT club_id,count(*) FROM miclub.people GROUP BY club_id ORDER BY club_id;
SELECT club_id,count(*) FROM miclub.import_batches GROUP BY club_id ORDER BY club_id;
