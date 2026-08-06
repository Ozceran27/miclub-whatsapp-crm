/* DBeaver/manual | PostgreSQL >=14 | DB: miclub_gestion | schema: miclub
 Emergency order: 06 only, reverses 04 -> 03 -> 02. Estimated: 1-10 min.
 No business data is deleted. Constraint validation itself is irreversible metadata work,
 but dropping each constraint exactly removes its enforcement. Index build I/O is not reversible. */
-- Reverse 04. Auto-commit required; CONCURRENTLY is outside transaction blocks.
DROP INDEX CONCURRENTLY IF EXISTS miclub.approval_requests_club_active_created_idx;

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
