BEGIN;

-- Replace the expression index with the exact tenant key used by role lookups
-- and foreign-key provisioning. Existing duplicates abort the migration rather
-- than being silently merged.
DROP INDEX IF EXISTS miclub.roles_club_code_key;
ALTER TABLE miclub.roles DROP CONSTRAINT IF EXISTS roles_club_code_key;
ALTER TABLE miclub.roles
  ADD CONSTRAINT roles_club_code_key UNIQUE (club_id, code);

COMMIT;
