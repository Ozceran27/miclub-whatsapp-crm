BEGIN;

-- responsible_employee_id is the canonical operational relationship. The
-- legacy instructor_id remains optional only to preserve historical links.
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

COMMIT;
