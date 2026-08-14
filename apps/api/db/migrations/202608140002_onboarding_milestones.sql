BEGIN;

ALTER TABLE miclub.club_onboarding
  ADD COLUMN IF NOT EXISTS completed_steps smallint[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS skipped_steps smallint[] NOT NULL DEFAULT '{}';

ALTER TABLE miclub.club_onboarding DROP CONSTRAINT IF EXISTS club_onboarding_completed_steps_check;
ALTER TABLE miclub.club_onboarding ADD CONSTRAINT club_onboarding_completed_steps_check
  CHECK (completed_steps <@ ARRAY[1,2,3,4,5,6]::smallint[]);
ALTER TABLE miclub.club_onboarding DROP CONSTRAINT IF EXISTS club_onboarding_skipped_steps_check;
ALTER TABLE miclub.club_onboarding ADD CONSTRAINT club_onboarding_skipped_steps_check
  CHECK (skipped_steps <@ ARRAY[2,3,4,5,6]::smallint[] AND NOT completed_steps && skipped_steps);

COMMIT;
