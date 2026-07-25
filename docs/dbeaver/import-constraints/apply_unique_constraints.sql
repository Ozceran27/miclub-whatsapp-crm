/* ESCRITURA DDL MANUAL. PRECONDICIONES:
   1) backup verificado; 2) diagnostic y prepare ejecutados; 3) ambos reportes de duplicados vacíos;
   4) detener backend/importadores durante la ventana. No borra ni modifica datos de negocio. */
BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM miclub.movements WHERE club_id IS NULL)
 OR EXISTS (SELECT 1 FROM miclub.enrollments WHERE club_id IS NULL) THEN RAISE EXCEPTION 'Hay club_id NULL; abortando'; END IF;
 IF EXISTS (SELECT 1 FROM miclub.movements WHERE external_id IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1)
 OR EXISTS (SELECT 1 FROM miclub.enrollments WHERE external_id IS NOT NULL GROUP BY club_id,external_id HAVING count(*)>1) THEN
   RAISE EXCEPTION 'Hay claves duplicadas; no se crea ningún índice'; END IF;
END $$;
-- Los nombres se toman de la migración multi-tenant ya versionada y del dump auditado.
-- IF NOT EXISTS conserva cualquier índice compatible existente; no retira uniques globales automáticamente.
CREATE UNIQUE INDEX IF NOT EXISTS movements_club_external_id_key
 ON miclub.movements(club_id,external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_club_external_id_key
 ON miclub.enrollments(club_id,external_id) WHERE external_id IS NOT NULL;
-- Estado sistémico solicitado. ALTER TYPE ADD VALUE exige PostgreSQL moderno y queda disponible tras COMMIT.
ALTER TYPE miclub.import_batch_status ADD VALUE IF NOT EXISTS 'failed_configuration';
COMMIT;
