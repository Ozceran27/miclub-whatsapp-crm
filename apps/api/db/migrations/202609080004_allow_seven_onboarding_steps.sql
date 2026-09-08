-- Align persisted completion with the existing seven-step public contract.
-- Real DB: manual DBeaver execution. No existing progress is rewritten.
-- Rollback before COMMIT: ROLLBACK. After step 7 is saved, use a forward fix;
-- restoring the six-step constraint would reject legitimate completed clubs.
BEGIN;
ALTER TABLE miclub.club_onboarding DROP CONSTRAINT club_onboarding_completed_steps_check;
ALTER TABLE miclub.club_onboarding ADD CONSTRAINT club_onboarding_completed_steps_check
 CHECK (completed_steps <@ ARRAY[1,2,3,4,5,6,7]::smallint[]);
DO $postcheck$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='miclub.club_onboarding'::regclass
 AND conname='club_onboarding_completed_steps_check' AND convalidated) THEN
  RAISE EXCEPTION 'Seven-step onboarding constraint not validated';
 END IF;
END $postcheck$;
COMMIT;
