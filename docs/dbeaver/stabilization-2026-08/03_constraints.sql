/* DBeaver/manual | PostgreSQL >=14 | DB: miclub_gestion | schema: miclub
 Order: 03. Estimated add <1 min, validation 1-5 min/table; brief SHARE UPDATE EXCLUSIVE locks.
 CHECKs are installed NOT VALID first; validation is deliberately separate. */
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='2min';
DO $apply$
BEGIN
 IF to_regclass('miclub.tasks') IS NULL OR to_regclass('miclub.activities') IS NULL OR to_regclass('miclub.sectors') IS NULL
 THEN RAISE EXCEPTION 'required tables are absent'; END IF;
 IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid='miclub.tasks'::regclass AND conname='tasks_title_nonblank_chk') THEN
  ALTER TABLE miclub.tasks ADD CONSTRAINT tasks_title_nonblank_chk CHECK (btrim(title) <> '') NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid='miclub.activities'::regclass AND conname='activities_name_nonblank_chk') THEN
  ALTER TABLE miclub.activities ADD CONSTRAINT activities_name_nonblank_chk CHECK (btrim(name) <> '') NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid='miclub.sectors'::regclass AND conname='sectors_name_nonblank_chk') THEN
  ALTER TABLE miclub.sectors ADD CONSTRAINT sectors_name_nonblank_chk CHECK (btrim(name) <> '') NOT VALID;
 END IF;
END $apply$;
COMMIT;

-- Separate validation phase: each statement may be retried independently after a lock timeout.
SET lock_timeout='5s'; SET statement_timeout='10min';
DO $validate$ BEGIN
 IF EXISTS (SELECT FROM pg_constraint WHERE conrelid='miclub.tasks'::regclass AND conname='tasks_title_nonblank_chk' AND NOT convalidated)
 THEN ALTER TABLE miclub.tasks VALIDATE CONSTRAINT tasks_title_nonblank_chk; END IF;
END $validate$;

DO $validate$ BEGIN
 IF EXISTS (SELECT FROM pg_constraint WHERE conrelid='miclub.activities'::regclass AND conname='activities_name_nonblank_chk' AND NOT convalidated)
 THEN ALTER TABLE miclub.activities VALIDATE CONSTRAINT activities_name_nonblank_chk; END IF;
END $validate$;
DO $validate$ BEGIN
 IF EXISTS (SELECT FROM pg_constraint WHERE conrelid='miclub.sectors'::regclass AND conname='sectors_name_nonblank_chk' AND NOT convalidated)
 THEN ALTER TABLE miclub.sectors VALIDATE CONSTRAINT sectors_name_nonblank_chk; END IF;
END $validate$;

/* RLS candidate (approved only when 01 has no BLOCK rows).
   This deliberately remains in 03: no policy DDL is allowed in cleanup/index scripts.
   The login used by the API must be granted miclub_runtime and execute SET ROLE
   miclub_runtime; workers use miclub_worker.  Neither role owns tables nor bypasses RLS. */
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='10min';

DO $roles$
BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='miclub_runtime') THEN
   CREATE ROLE miclub_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='miclub_worker') THEN
   CREATE ROLE miclub_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='miclub_operations') THEN
   CREATE ROLE miclub_operations NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='miclub_backfill') THEN
   CREATE ROLE miclub_backfill NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
 END IF;
END $roles$;

-- Fail closed. The known indirect tenant children must first be remodeled with
-- club_id NOT NULL; audit_log must also be cleaned before it can join the policy set.
DO $rls_preflight$
DECLARE t text; unsafe_fks integer;
BEGIN
 FOREACH t IN ARRAY ARRAY['activity_schedules','sector_settlements'] LOOP
   IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema='miclub'
      AND table_name=t AND column_name='club_id' AND is_nullable='NO') THEN
     RAISE EXCEPTION 'RLS not approved: %.club_id NOT NULL is required',t;
   END IF;
 END LOOP;
 IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema='miclub'
   AND table_name='audit_log' AND column_name='club_id' AND is_nullable='YES') THEN
   RAISE EXCEPTION 'RLS not approved: audit_log.club_id remains nullable';
 END IF;
 SELECT count(*) INTO unsafe_fks
 FROM pg_constraint con JOIN pg_class child ON child.oid=con.conrelid
 JOIN pg_class parent ON parent.oid=con.confrelid JOIN pg_namespace n ON n.oid=child.relnamespace
 WHERE con.contype='f' AND n.nspname='miclub'
   AND EXISTS (SELECT FROM pg_attribute WHERE attrelid=child.oid AND attname='club_id' AND NOT attisdropped)
   AND EXISTS (SELECT FROM pg_attribute WHERE attrelid=parent.oid AND attname='club_id' AND NOT attisdropped)
   AND NOT EXISTS (SELECT FROM unnest(con.conkey) k JOIN pg_attribute a
     ON a.attrelid=child.oid AND a.attnum=k WHERE a.attname='club_id');
 IF unsafe_fks<>0 THEN
   RAISE EXCEPTION 'RLS not approved: % tenant foreign keys are not composite',unsafe_fks;
 END IF;
END $rls_preflight$;

GRANT USAGE ON SCHEMA miclub TO miclub_runtime,miclub_worker,miclub_operations,miclub_backfill;
GRANT SELECT ON ALL TABLES IN SCHEMA miclub TO miclub_operations;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA miclub TO miclub_backfill;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA miclub TO miclub_backfill;

DO $rls$
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
   EXECUTE format('ALTER TABLE miclub.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('ALTER TABLE miclub.%I FORCE ROW LEVEL SECURITY',t);
   EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON miclub.%I',t);
   EXECUTE format($p$CREATE POLICY tenant_isolation ON miclub.%I TO miclub_runtime,miclub_worker
     USING (club_id = NULLIF(current_setting('app.club_id',true),'')::uuid)
     WITH CHECK (club_id = NULLIF(current_setting('app.club_id',true),'')::uuid)$p$,t);
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON miclub.%I TO miclub_runtime,miclub_worker',t);
 END LOOP;
END $rls$;

-- Global catalogs are intentionally readable, never made tenant policies.
GRANT SELECT ON miclub.clubs,miclub.currencies,miclub.import_amount_normalization_rules,
 miclub.system_months TO miclub_runtime,miclub_worker;
COMMIT;
