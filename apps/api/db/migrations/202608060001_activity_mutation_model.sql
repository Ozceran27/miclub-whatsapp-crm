-- Modelo mínimo y guardas de dominio requeridos por las mutaciones HTTP.
ALTER TABLE miclub.activities
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES miclub.users(id);

CREATE INDEX IF NOT EXISTS activities_club_active_idx
  ON miclub.activities (club_id, sector_id) WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION miclub.validate_activity_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.club_commission_percent < 0 OR NEW.club_commission_percent > 100 THEN
    RAISE EXCEPTION 'club_commission_percent must be between 0 and 100' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'active' AND NEW.manager_person_id IS NULL THEN
    RAISE EXCEPTION 'active activity requires manager_person_id' USING ERRCODE = '23514';
  END IF;
  IF NEW.archived_at IS NOT NULL AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'archived activity must have archived status' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS activities_validate_mutation ON miclub.activities;
CREATE TRIGGER activities_validate_mutation
BEFORE INSERT OR UPDATE ON miclub.activities
FOR EACH ROW EXECUTE FUNCTION miclub.validate_activity_mutation();

COMMENT ON COLUMN miclub.activities.updated_by IS
  'Actor de la última mutación administrativa; las mutaciones requieren que esta migración figure aplicada.';
