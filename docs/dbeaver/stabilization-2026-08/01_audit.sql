/* DBeaver/manual | PostgreSQL >=14 | DB: miclub_gestion | schema: miclub
 Order: 01 (mandatory, before approval). READ ONLY. Estimated: 1-10 min; locks: ACCESS SHARE.
 Run as one script and export every result set. Never enable auto-commit mid-script. */
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10min';
SET LOCAL lock_timeout = '2s';

-- Tables and estimated/live row counts.
SELECT c.relname AS table_name, c.reltuples::bigint AS estimated_rows,
       pg_total_relation_size(c.oid) AS total_bytes
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='miclub' AND c.relkind IN ('r','p') ORDER BY 1;

-- Columns, exact types, nullability, defaults and identity/generated metadata.
SELECT c.table_name,c.ordinal_position,c.column_name,c.data_type,c.udt_name,
       c.is_nullable,c.column_default,c.is_identity,c.identity_generation,c.is_generated,c.generation_expression
FROM information_schema.columns c WHERE c.table_schema='miclub'
ORDER BY c.table_name,c.ordinal_position;

-- PK, FK, UNIQUE and CHECK constraints, including validation state.
SELECT cl.relname AS table_name, con.conname, con.contype,
       pg_get_constraintdef(con.oid,true) AS definition, con.convalidated,
       ref.relname AS referenced_table
FROM pg_constraint con JOIN pg_class cl ON cl.oid=con.conrelid
JOIN pg_namespace n ON n.oid=cl.relnamespace LEFT JOIN pg_class ref ON ref.oid=con.confrelid
WHERE n.nspname='miclub' ORDER BY cl.relname,con.contype,con.conname;

-- Indexes (definition permits review of equivalent/duplicate keys and predicates).
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='miclub' ORDER BY tablename,indexname;

-- Views and materialized views.
SELECT n.nspname AS schema_name,c.relname AS view_name,c.relkind,
       pg_get_viewdef(c.oid,true) AS definition
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='miclub' AND c.relkind IN ('v','m') ORDER BY c.relname;

-- User triggers (including disabled state) and their functions.
SELECT tbl.relname AS table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) AS definition,
       pn.nspname||'.'||p.proname AS function_name
FROM pg_trigger t JOIN pg_class tbl ON tbl.oid=t.tgrelid JOIN pg_namespace n ON n.oid=tbl.relnamespace
JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
WHERE n.nspname='miclub' AND NOT t.tgisinternal ORDER BY 1,2;

-- Sequences and ownership/default linkage.
SELECT s.schemaname,s.sequencename,s.data_type,s.start_value,s.min_value,s.max_value,s.increment_by,
       s.cycle,s.cache_size,s.last_value
FROM pg_sequences s WHERE s.schemaname='miclub' ORDER BY s.sequencename;

-- Logical duplicates relevant to real conflict targets.
SELECT 'people.normalized_dni' AS rule,club_id,normalized_dni AS logical_key,count(*) AS duplicates
FROM miclub.people WHERE normalized_dni IS NOT NULL GROUP BY club_id,normalized_dni HAVING count(*)>1
UNION ALL
SELECT 'sectors.name',club_id,lower(trim(name)),count(*) FROM miclub.sectors
GROUP BY club_id,lower(trim(name)) HAVING count(*)>1
UNION ALL
SELECT 'movement.external_id',club_id,external_id,count(*) FROM miclub.movements WHERE external_id IS NOT NULL
GROUP BY club_id,external_id HAVING count(*)>1 ORDER BY 1,2;

-- Orphans and cross-tenant links on high-value operational relations.
SELECT relation,issue,count(*) AS affected FROM (
 SELECT 'activities->sectors' relation,CASE WHEN s.id IS NULL THEN 'orphan_or_cross_tenant' END issue
 FROM miclub.activities a LEFT JOIN miclub.sectors s ON (s.id,s.club_id)=(a.sector_id,a.club_id)
 UNION ALL SELECT 'enrollments->people',CASE WHEN p.id IS NULL THEN 'orphan_or_cross_tenant' END
 FROM miclub.enrollments e LEFT JOIN miclub.people p ON (p.id,p.club_id)=(e.person_id,e.club_id)
 UNION ALL SELECT 'enrollments->activities',CASE WHEN a.id IS NULL THEN 'orphan_or_cross_tenant' END
 FROM miclub.enrollments e LEFT JOIN miclub.activities a ON (a.id,a.club_id)=(e.activity_id,e.club_id)
 UNION ALL SELECT 'movements->sectors',CASE WHEN s.id IS NULL THEN 'orphan_or_cross_tenant' END
 FROM miclub.movements m LEFT JOIN miclub.sectors s ON (s.id,s.club_id)=(m.sector_id,m.club_id) WHERE m.sector_id IS NOT NULL
) q WHERE issue IS NOT NULL GROUP BY relation,issue ORDER BY relation;

-- Tenant coverage for every physical table: missing club_id plus NULL coverage where present.
SELECT t.table_name,
       CASE WHEN c.column_name IS NULL THEN 'MISSING club_id' ELSE 'HAS club_id' END AS tenant_column,
       CASE WHEN c.column_name IS NULL THEN NULL ELSE c.is_nullable END AS nullable
FROM information_schema.tables t LEFT JOIN information_schema.columns c
 ON c.table_schema=t.table_schema AND c.table_name=t.table_name AND c.column_name='club_id'
WHERE t.table_schema='miclub' AND t.table_type='BASE TABLE' ORDER BY t.table_name;

-- Canonical inventory.  INDIRECT TENANT tables belong to a tenant through their
-- parent and must acquire club_id before RLS can be approved.  A row returned by
-- either of the following two queries is an approval blocker.
WITH inventory(table_name,scope,area) AS (VALUES
 ('activities','TENANT','catalog'),('activity_fee_cleanup_candidates','TENANT','audit'),
 ('activity_fee_history','TENANT','audit'),('activity_schedules','INDIRECT TENANT','catalog'),
 ('approval_requests','TENANT','requests'),('audit_log','TENANT','audit'),
 ('club_memberships','TENANT','membership'),('crm_message_history','TENANT','crm'),
 ('crm_message_templates','TENANT','crm'),('discount_rates','TENANT','catalog'),
 ('employees','TENANT','workers'),('enrollment_fee_audit','TENANT','audit'),
 ('enrollments','TENANT','operations'),('import_batches','TENANT','imports'),
 ('import_errors','TENANT','imports'),('instructors','TENANT','catalog'),
 ('movement_categories','TENANT','catalog'),('movements','TENANT','operations'),
 ('operational_balances','TENANT','operations'),('payment_allocations','TENANT','operations'),
 ('payment_methods','TENANT','catalog'),('payments','TENANT','operations'),
 ('people','TENANT','crm'),('person_kind_links','TENANT','crm'),
 ('receivables','TENANT','operations'),('roles','TENANT','authorization'),
 ('salon_hour_prices','TENANT','catalog'),('sector_settlements','INDIRECT TENANT','operations'),
 ('sectors','TENANT','catalog'),('sheet_metric_snapshots','TENANT','imports'),
 ('tasks','TENANT','tasks'),('user_club_memberships','TENANT','authorization'),
 ('app_sessions','GLOBAL','authorization'),('clubs','GLOBAL','catalog'),
 ('currencies','GLOBAL','catalog'),('import_amount_normalization_rules','GLOBAL','imports'),
 ('rate_limit_buckets','GLOBAL','security'),('system_months','GLOBAL','catalog'),
 ('users','GLOBAL','authorization')
), actual AS (
 SELECT t.table_name,CASE WHEN c.column_name IS NULL THEN false ELSE true END has_club_id,
        c.is_nullable
 FROM information_schema.tables t LEFT JOIN information_schema.columns c
 ON c.table_schema=t.table_schema AND c.table_name=t.table_name AND c.column_name='club_id'
 WHERE t.table_schema='miclub' AND t.table_type='BASE TABLE'
)
SELECT i.*,a.has_club_id,a.is_nullable,
 CASE WHEN a.table_name IS NULL THEN 'MISSING TABLE'
      WHEN i.scope IN ('TENANT','INDIRECT TENANT') AND NOT a.has_club_id THEN 'BLOCK: club_id missing'
      WHEN i.scope='TENANT' AND a.is_nullable='YES' THEN 'BLOCK: club_id nullable'
      WHEN i.scope='GLOBAL' AND a.has_club_id THEN 'BLOCK: inventory mismatch'
      ELSE 'OK' END decision
FROM inventory i LEFT JOIN actual a USING(table_name)
UNION ALL
SELECT a.table_name,'UNCLASSIFIED','unknown',a.has_club_id,a.is_nullable,'BLOCK: classify table'
FROM actual a WHERE NOT EXISTS (SELECT FROM inventory i WHERE i.table_name=a.table_name)
ORDER BY 2,1;

-- Existing RLS and policies.  relrowsecurity=false, relforcerowsecurity=false,
-- no policy, a permissive role target, or an expression other than app.club_id
-- must be reviewed before approval. FORCE is required because the dump owner is
-- also currently miclub_app and table owners otherwise bypass RLS.
SELECT c.relname AS table_name,c.relowner::regrole AS owner,c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,p.polname,p.polpermissive,
       CASE WHEN p.polroles='{0}' THEN 'PUBLIC' ELSE
         array_to_string(ARRAY(SELECT r.rolname FROM pg_roles r WHERE r.oid=ANY(p.polroles)),',') END roles,
       pg_get_expr(p.polqual,p.polrelid) AS using_expression,
       pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid=c.oid
WHERE n.nspname='miclub' AND c.relkind IN ('r','p') ORDER BY 1,6;

-- Every FK between two club_id-bearing tables must carry club_id on both sides.
-- Any row is a cross-tenant association vulnerability, even when current data is clean.
SELECT child.relname AS child_table,con.conname,pg_get_constraintdef(con.oid,true) definition,
       parent.relname AS parent_table
FROM pg_constraint con JOIN pg_class child ON child.oid=con.conrelid
JOIN pg_class parent ON parent.oid=con.confrelid JOIN pg_namespace n ON n.oid=child.relnamespace
WHERE con.contype='f' AND n.nspname='miclub'
  AND EXISTS (SELECT FROM pg_attribute WHERE attrelid=child.oid AND attname='club_id' AND NOT attisdropped)
  AND EXISTS (SELECT FROM pg_attribute WHERE attrelid=parent.oid AND attname='club_id' AND NOT attisdropped)
  AND NOT EXISTS (SELECT FROM unnest(con.conkey) k JOIN pg_attribute a ON a.attrelid=child.oid AND a.attnum=k WHERE a.attname='club_id')
ORDER BY 1,2;

-- Role separation gate: runtime and workers must not own tables or bypass RLS;
-- backfill is the only expected BYPASSRLS role and must not be used by the API.
SELECT r.rolname,r.rolcanlogin,r.rolsuper,r.rolbypassrls,
       count(c.oid) FILTER (WHERE n.nspname='miclub') AS owned_miclub_relations
FROM pg_roles r LEFT JOIN pg_class c ON c.relowner=r.oid
LEFT JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname IN ('miclub_runtime','miclub_worker','miclub_operations','miclub_backfill')
GROUP BY r.oid,r.rolname,r.rolcanlogin,r.rolsuper,r.rolbypassrls ORDER BY 1;

SELECT 'activities' table_name,count(*) FILTER (WHERE club_id IS NULL) null_club FROM miclub.activities
UNION ALL SELECT 'enrollments',count(*) FILTER (WHERE club_id IS NULL) FROM miclub.enrollments
UNION ALL SELECT 'movements',count(*) FILTER (WHERE club_id IS NULL) FROM miclub.movements
UNION ALL SELECT 'people',count(*) FILTER (WHERE club_id IS NULL) FROM miclub.people
UNION ALL SELECT 'sectors',count(*) FILTER (WHERE club_id IS NULL) FROM miclub.sectors;
ROLLBACK;
