/* DBeaver/manual | PostgreSQL >=14 | DB: miclub_gestion | schema: miclub
 Order: 04. Auto-commit MUST be enabled: CREATE INDEX CONCURRENTLY cannot run in a transaction.
 Estimated: 1-10 min; no table write lock, but extra I/O. Query source:
 apps/api/src/repositories/requestsRepository.ts list: club_id + archived_at + created_at DESC. */
SET lock_timeout='5s'; SET statement_timeout='15min';

-- Reject an equivalent differently named index before building another copy.
DO $preflight$
BEGIN
 IF to_regclass('miclub.approval_requests') IS NULL THEN RAISE EXCEPTION 'approval_requests is absent'; END IF;
 IF to_regclass('miclub.approval_requests_club_active_created_idx') IS NULL AND EXISTS (
   SELECT 1 FROM pg_indexes WHERE schemaname='miclub' AND tablename='approval_requests'
   AND indexdef ~* '\\(club_id, created_at DESC\\)' AND indexdef ~* 'WHERE \\(archived_at IS NULL\\)'
 ) THEN RAISE EXCEPTION 'equivalent approval_requests index already exists under another name'; END IF;
END $preflight$;

CREATE INDEX CONCURRENTLY IF NOT EXISTS approval_requests_club_active_created_idx
ON miclub.approval_requests (club_id, created_at DESC) WHERE archived_at IS NULL;
