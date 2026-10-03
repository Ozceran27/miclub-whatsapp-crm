-- miClub Gestión: índice para contactos importados contactados recientemente.
-- Ejecutar manualmente en DBeaver con rol administrador, después de verificar
-- que la migración 202609280001_crm_xlsx_contacts.sql ya está instalada.
-- No ejecutar mediante la conexión de auditoría de solo lectura.
-- Antes de ejecutar, comprobar el club y backup aplicables a esta base.

BEGIN;

DO $$ BEGIN
  IF to_regclass('miclub.crm_xlsx_messages') IS NULL
     OR to_regclass('miclub.crm_xlsx_contacts') IS NULL THEN
    RAISE EXCEPTION 'Faltan tablas CRM XLSX';
  END IF;
END $$;

-- Contenido íntegro de la migración versionada 202610020001.
-- Accelerate tenant-scoped lookups of recent manual confirmations.
CREATE INDEX IF NOT EXISTS crm_xlsx_messages_sent_recent
  ON miclub.crm_xlsx_messages (club_id, sent_at DESC, contact_id)
  WHERE status = 'sent_manual' AND sent_at IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='miclub' AND tablename='crm_xlsx_messages'
      AND indexname='crm_xlsx_messages_sent_recent'
  ) THEN
    RAISE EXCEPTION 'No se creó el índice de envíos recientes';
  END IF;
END $$;

COMMIT;

-- Validación posterior:
SELECT indexname,indexdef FROM pg_indexes
WHERE schemaname='miclub' AND tablename='crm_xlsx_messages'
  AND indexname='crm_xlsx_messages_sent_recent';

-- Rollback manual, solo si se decide revertir esta optimización:
-- DROP INDEX IF EXISTS miclub.crm_xlsx_messages_sent_recent;
-- No insertar manualmente filas en public.miclub_schema_migrations.
