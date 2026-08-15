BEGIN;

-- entity_status installations use Spanish labels (for example, "activa" and
-- "cancelada"). Comparing the enum directly with optional English labels makes
-- PostgreSQL cast every literal to the enum and fail with 22P02 before evaluating
-- the condition. Compare its textual representation so the guard remains
-- compatible with both historical label sets.
CREATE OR REPLACE FUNCTION miclub.validate_activity_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.club_commission_percent < 0 OR NEW.club_commission_percent > 100 THEN
    RAISE EXCEPTION 'club_commission_percent must be between 0 and 100' USING ERRCODE = '23514';
  END IF;
  IF NEW.status::text IN ('active', 'activa') AND NEW.instructor_id IS NULL THEN
    RAISE EXCEPTION 'active activity requires canonical instructor_id' USING ERRCODE = '23514';
  END IF;
  IF NEW.archived_at IS NOT NULL AND NEW.status::text NOT IN ('archived', 'cancelada') THEN
    RAISE EXCEPTION 'archived activity must have archived status' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

COMMIT;
