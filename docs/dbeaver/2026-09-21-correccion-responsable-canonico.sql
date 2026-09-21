-- miClub Gestión - corrección posterior para instalaciones que ya ejecutaron
-- 2026-09-21-responsables-trabajadores.sql.
-- EJECUCIÓN MANUAL EXCLUSIVA EN DBEAVER. Usar una conexión nueva y ejecutar
-- este archivo completo con Execute SQL Script.

ROLLBACK;
BEGIN;

DO $$
BEGIN
  IF current_setting('transaction_read_only')::boolean THEN
    RAISE EXCEPTION 'La conexión es read-only. Use una conexión administrativa controlada.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='miclub' AND table_name='activities'
      AND column_name='responsible_employee_id'
  ) THEN
    RAISE EXCEPTION 'Primero ejecute 2026-09-21-responsables-trabajadores.sql completo.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION miclub.validate_activity_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.club_commission_percent < 0 OR NEW.club_commission_percent > 100 THEN
    RAISE EXCEPTION 'club_commission_percent must be between 0 and 100' USING ERRCODE = '23514';
  END IF;
  IF NEW.status::text IN ('active', 'activa') AND NEW.responsible_employee_id IS NULL THEN
    RAISE EXCEPTION 'active activity requires responsible_employee_id' USING ERRCODE = '23514';
  END IF;
  IF NEW.archived_at IS NOT NULL AND NEW.status::text NOT IN ('archived', 'cancelada') THEN
    RAISE EXCEPTION 'archived activity must have archived status' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS activities_validate_mutation ON miclub.activities;
CREATE TRIGGER activities_validate_mutation
BEFORE INSERT OR UPDATE ON miclub.activities
FOR EACH ROW EXECUTE FUNCTION miclub.validate_activity_mutation();

DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('miclub.validate_activity_mutation()'::regprocedure) INTO definition;
  IF definition NOT LIKE '%responsible_employee_id%' OR definition LIKE '%requires canonical instructor_id%' THEN
    RAISE EXCEPTION 'Post-validación fallida: continúa activa la guarda legacy de Instructor.';
  END IF;
END $$;

COMMIT;
