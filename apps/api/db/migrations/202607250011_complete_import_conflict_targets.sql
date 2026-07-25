-- Every arbiter used by the Google Sheets importer must be available through
-- the root migration runner. Historical multitenant scripts live in a nested
-- directory and are deliberately not discovered by that runner.
-- Existing global UNIQUE keys make these tenant-scoped indexes safe to add.
CREATE UNIQUE INDEX IF NOT EXISTS operational_balances_club_source_cutoff_key
  ON miclub.operational_balances (club_id, source, cutoff_date);

CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_club_normalized_name_key
  ON miclub.payment_methods (club_id, lower(name));

-- Dedicated names avoid accepting historical partial/expression variants that
-- PostgreSQL cannot infer for the current ON CONFLICT clauses.
CREATE UNIQUE INDEX IF NOT EXISTS instructors_import_conflict_key
  ON miclub.instructors (club_id, person_id);

-- Match the expression in activitiesRepository exactly. The older nested
-- migration lower-cased modality too, which is not an arbiter for this SQL.
CREATE UNIQUE INDEX IF NOT EXISTS activities_import_conflict_key
  ON miclub.activities (club_id, sector_id, lower(name), coalesce(modality, ''::text));
