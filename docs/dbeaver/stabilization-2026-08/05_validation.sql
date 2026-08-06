/* DBeaver/manual | PostgreSQL >=14 | DB: miclub_gestion | schema: miclub
 Order: 05. READ ONLY. Estimated: 1-10 min; locks: ACCESS SHARE. Expected affected counts: zero. */
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='10min'; SET LOCAL lock_timeout='2s';

-- Tenant isolation, orphan and relationship consistency checks.
SELECT 'activities_sector' check_name,count(*) affected FROM miclub.activities a
LEFT JOIN miclub.sectors s ON (s.id,s.club_id)=(a.sector_id,a.club_id) WHERE s.id IS NULL
UNION ALL SELECT 'enrollments_person',count(*) FROM miclub.enrollments e
LEFT JOIN miclub.people p ON (p.id,p.club_id)=(e.person_id,e.club_id) WHERE p.id IS NULL
UNION ALL SELECT 'enrollments_activity',count(*) FROM miclub.enrollments e
LEFT JOIN miclub.activities a ON (a.id,a.club_id)=(e.activity_id,e.club_id) WHERE a.id IS NULL
UNION ALL SELECT 'movement_sector',count(*) FROM miclub.movements m
LEFT JOIN miclub.sectors s ON (s.id,s.club_id)=(m.sector_id,m.club_id) WHERE m.sector_id IS NOT NULL AND s.id IS NULL;

-- Logical duplicates.
SELECT 'people_dni' check_name,count(*) affected FROM (
 SELECT club_id,normalized_dni FROM miclub.people WHERE normalized_dni IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) d
UNION ALL SELECT 'sector_name',count(*) FROM (
 SELECT club_id,lower(trim(name)) FROM miclub.sectors GROUP BY 1,2 HAVING count(*)>1) d;

-- Required constraints: present and validated.
SELECT v.table_name,v.constraint_name,c.convalidated,
 CASE WHEN c.oid IS NULL THEN 'MISSING' WHEN NOT c.convalidated THEN 'NOT VALIDATED' ELSE 'OK' END status
FROM (VALUES ('tasks','tasks_title_nonblank_chk'),('activities','activities_name_nonblank_chk'),
 ('sectors','sectors_name_nonblank_chk')) v(table_name,constraint_name)
LEFT JOIN pg_constraint c ON c.conrelid=('miclub.'||v.table_name)::regclass AND c.conname=v.constraint_name;

-- Required index and validity/readiness; definition verifies tenant and partial predicate.
SELECT i.indexrelid::regclass AS index_name,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) definition
FROM pg_index i WHERE i.indexrelid=to_regclass('miclub.approval_requests_club_active_created_idx');

-- Tenant-null coverage for principal operational relations.
SELECT 'activities' table_name,count(*) affected FROM miclub.activities WHERE club_id IS NULL
UNION ALL SELECT 'people',count(*) FROM miclub.people WHERE club_id IS NULL
UNION ALL SELECT 'enrollments',count(*) FROM miclub.enrollments WHERE club_id IS NULL
UNION ALL SELECT 'movements',count(*) FROM miclub.movements WHERE club_id IS NULL;
ROLLBACK;
