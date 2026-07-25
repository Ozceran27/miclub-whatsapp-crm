-- Align Google Sheets UPSERT inference with nullable, tenant-scoped imported identities.
-- Manual production rollout is documented in docs/dbeaver/import-constraints/.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM miclub.movements WHERE external_id IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1)
 OR EXISTS (SELECT 1 FROM miclub.enrollments WHERE external_id IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1) THEN
   RAISE EXCEPTION 'Duplicate tenant import identities must be reconciled before creating UNIQUE indexes';
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS movements_club_external_id_key
 ON miclub.movements(club_id,external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_club_external_id_key
 ON miclub.enrollments(club_id,external_id) WHERE external_id IS NOT NULL;
ALTER TYPE miclub.import_batch_status ADD VALUE IF NOT EXISTS 'failed_configuration';
