-- Complements the exclusion constraint: every version after the first must start
-- on the day immediately following its predecessor. Deferred execution permits
-- replacing/splitting a term atomically without rejecting the intermediate state.
CREATE OR REPLACE FUNCTION miclub.validate_activity_terms_contiguous() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_activity_id uuid := coalesce(NEW.activity_id, OLD.activity_id);
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT effective_from,
             lag(effective_to) OVER (ORDER BY effective_from) AS previous_effective_to
      FROM miclub.activity_terms
      WHERE activity_id = target_activity_id
    ) versions
    WHERE previous_effective_to IS NOT NULL
      AND effective_from <> previous_effective_to + 1
  ) THEN
    RAISE EXCEPTION 'activity terms must be contiguous' USING ERRCODE = '23514';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS activity_terms_contiguous ON miclub.activity_terms;
CREATE CONSTRAINT TRIGGER activity_terms_contiguous
AFTER INSERT OR UPDATE OR DELETE ON miclub.activity_terms
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION miclub.validate_activity_terms_contiguous();
