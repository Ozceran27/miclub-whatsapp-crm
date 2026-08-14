/*
  miClub — filas versionadas de importaciones XLSX.
  PostgreSQL / DBeaver: ejecutar TODO este archivo con "Execute SQL Script".
  Este archivo contiene únicamente SQL; no copie el nombre o la ruta del archivo
  dentro del editor SQL.
*/

BEGIN;

DO $prerequisites$
BEGIN
  IF to_regclass('miclub.clubs') IS NULL THEN
    RAISE EXCEPTION 'Falta miclub.clubs. Ejecute primero las migraciones multitenant.';
  END IF;
  IF to_regclass('miclub.import_batches') IS NULL THEN
    RAISE EXCEPTION 'Falta miclub.import_batches. Ejecute primero el schema de importación.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='miclub' AND table_name='import_batches' AND column_name='club_id'
  ) THEN
    RAISE EXCEPTION 'Falta miclub.import_batches.club_id. Ejecute primero el backfill multitenant.';
  END IF;
END
$prerequisites$;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid='miclub.import_batches'::regclass
      AND conname='import_batches_id_club_unique'
  ) THEN
    ALTER TABLE miclub.import_batches
      ADD CONSTRAINT import_batches_id_club_unique UNIQUE (id,club_id);
  END IF;
END
$constraint$;

CREATE TABLE IF NOT EXISTS miclub.xlsx_import_rows (
  club_id uuid NOT NULL REFERENCES miclub.clubs(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL,
  sheet text NOT NULL CHECK (sheet IN ('ADMINISTRACIÓN','INSCRIPCIONES')),
  row_fingerprint text NOT NULL CHECK (row_fingerprint ~ '^[0-9a-f]{64}$'),
  external_reference text,
  source_row_number integer NOT NULL CHECK (source_row_number >= 2),
  entity_id uuid NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id,batch_id,sheet,row_fingerprint),
  UNIQUE (club_id,batch_id,sheet,source_row_number),
  FOREIGN KEY (batch_id,club_id)
    REFERENCES miclub.import_batches(id,club_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS xlsx_import_rows_external_reference_idx
  ON miclub.xlsx_import_rows(club_id,sheet,external_reference)
  WHERE external_reference IS NOT NULL;

ALTER TABLE miclub.xlsx_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE miclub.xlsx_import_rows FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS xlsx_import_rows_tenant_isolation
  ON miclub.xlsx_import_rows;
CREATE POLICY xlsx_import_rows_tenant_isolation
  ON miclub.xlsx_import_rows
  USING (club_id = nullif(current_setting('app.club_id',true),'')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id',true),'')::uuid);

COMMENT ON TABLE miclub.xlsx_import_rows IS
  'Claves versionadas, no PII, de cada fila XLSX efectivamente importada.';
COMMENT ON COLUMN miclub.xlsx_import_rows.entity_id IS
  'Entidad creada; sheet determina si pertenece a movements o enrollments.';

COMMIT;

SELECT
  to_regclass('miclub.xlsx_import_rows') AS installed_table,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
WHERE c.oid=to_regclass('miclub.xlsx_import_rows');
