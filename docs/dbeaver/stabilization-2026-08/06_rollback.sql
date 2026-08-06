/* DBeaver/manual | PostgreSQL >=14 | DB: miclub_gestion | schema: miclub
 Emergency order: 06 only, reverses 04 -> 03 -> 02. Estimated: 1-10 min.
 No business data is deleted. Constraint validation itself is irreversible metadata work,
 but dropping each constraint exactly removes its enforcement. Index build I/O is not reversible. */
-- Reverse 04. Auto-commit required; CONCURRENTLY is outside transaction blocks.
DROP INDEX CONCURRENTLY IF EXISTS miclub.approval_requests_club_active_created_idx;

-- Reverse only the RLS/policy/grant portion of 03. Login membership grants are
-- intentionally managed outside this script; this revokes object privileges and
-- leaves the four NOLOGIN roles available for forensic attribution.
BEGIN;
DO $rls_rollback$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
  'activities','activity_fee_cleanup_candidates','activity_fee_history','activity_schedules',
  'approval_requests','audit_log','club_memberships','crm_message_history','crm_message_templates',
  'discount_rates','employees','enrollment_fee_audit','enrollments','import_batches','import_errors',
  'instructors','movement_categories','movements','operational_balances','payment_allocations',
  'payment_methods','payments','people','person_kind_links','receivables','roles','salon_hour_prices',
  'sector_settlements','sectors','sheet_metric_snapshots','tasks','user_club_memberships'
 ] LOOP
   IF to_regclass(format('miclub.%I',t)) IS NOT NULL THEN
     EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON miclub.%I',t);
     EXECUTE format('ALTER TABLE miclub.%I NO FORCE ROW LEVEL SECURITY',t);
     EXECUTE format('ALTER TABLE miclub.%I DISABLE ROW LEVEL SECURITY',t);
     EXECUTE format('REVOKE ALL ON miclub.%I FROM miclub_runtime,miclub_worker',t);
   END IF;
 END LOOP;
END $rls_rollback$;
REVOKE ALL ON ALL TABLES IN SCHEMA miclub FROM miclub_operations,miclub_backfill;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA miclub FROM miclub_backfill;
REVOKE USAGE ON SCHEMA miclub FROM miclub_runtime,miclub_worker,miclub_operations,miclub_backfill;
COMMIT;

-- Reverse 03. Brief ACCESS EXCLUSIVE locks; catalog guards make reruns safe.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='2min';
ALTER TABLE IF EXISTS miclub.tasks DROP CONSTRAINT IF EXISTS tasks_title_nonblank_chk;
ALTER TABLE IF EXISTS miclub.activities DROP CONSTRAINT IF EXISTS activities_name_nonblank_chk;
ALTER TABLE IF EXISTS miclub.sectors DROP CONSTRAINT IF EXISTS sectors_name_nonblank_chk;
COMMIT;

-- Reverse 02: restore the exact redundant index that cleanup removed.
-- Auto-commit required. This intentionally restores the pre-cleanup duplicate structure.
CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_active_due_idx ON miclub.tasks (club_id,due_at)
WHERE archived_at IS NULL AND due_at IS NOT NULL;
