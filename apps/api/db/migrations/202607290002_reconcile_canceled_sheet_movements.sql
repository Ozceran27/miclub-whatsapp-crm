-- Reconcile rows that an older importer incorrectly mapped to COMPLETADO.
-- The source row ID makes this correction tenant-safe and idempotent.
BEGIN;

UPDATE miclub.movements
SET operational_status = 'ANULADO'::miclub.movement_status,
    updated_at = now()
WHERE source = 'google_sheets'
  AND source_payload->'row'->>0 IN (
    'I-0170', 'I-0402', 'I-0425', 'I-0436', 'I-0433',
    'I-0597', 'I-0637', 'I-0636', 'I-0858'
  )
  AND operational_status = 'COMPLETADO'::miclub.movement_status;

COMMIT;
