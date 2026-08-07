/* Propaga tenant batch -> error; preserva payload, estadísticas y timestamps. */
BEGIN; DO $$ BEGIN
 UPDATE miclub.import_errors e SET club_id=b.club_id FROM miclub.import_batches b WHERE e.club_id IS NULL AND e.batch_id=b.id AND b.club_id IS NOT NULL;
 IF EXISTS(SELECT FROM miclub.import_errors e JOIN miclub.import_batches b ON b.id=e.batch_id WHERE e.club_id IS DISTINCT FROM b.club_id) THEN RAISE EXCEPTION 'BLOCKER: import_error/batch cross-tenant'; END IF;
END $$;
INSERT INTO miclub.audit_log(user_id,club_id,membership_id,action,entity_type,result,metadata)
SELECT m.user_id,m.club_id,m.id,'BACKFILL_DOMAIN_COMPLETED','migration_metadata','success',jsonb_build_object('version','2026-08-integral-v1','script','11_migration_metadata_backfill.sql')
FROM miclub.user_club_memberships m JOIN miclub.roles r ON r.id=m.role_id AND r.club_id=m.club_id JOIN miclub.clubs c ON c.id=m.club_id
WHERE m.status='active' AND upper(r.code)='DIRECTOR' AND lower(btrim(c.name))='miclub';
INSERT INTO miclub.audit_log(user_id,club_id,membership_id,action,entity_type,result,metadata)
SELECT m.user_id,m.club_id,m.id,'BACKFILL_COMPLETED','integral_backfill','success',jsonb_build_object('version','2026-08-integral-v1','script','11_migration_metadata_backfill.sql')
FROM miclub.user_club_memberships m JOIN miclub.roles r ON r.id=m.role_id AND r.club_id=m.club_id JOIN miclub.clubs c ON c.id=m.club_id
WHERE m.status='active' AND upper(r.code)='DIRECTOR' AND lower(btrim(c.name))='miclub';
SELECT count(*) batches_without_tenant FROM miclub.import_batches WHERE club_id IS NULL;
SELECT count(*) errors_without_tenant FROM miclub.import_errors WHERE club_id IS NULL;
COMMIT;
