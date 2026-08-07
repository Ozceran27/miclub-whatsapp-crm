/* DBeaver auto-commit ON. No envolver en BEGIN. */
SET lock_timeout='5s'; SET statement_timeout='15min';
CREATE INDEX CONCURRENTLY IF NOT EXISTS movements_club_activity_idx ON miclub.movements(club_id,activity_id) WHERE activity_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS enrollments_club_activity_person_idx ON miclub.enrollments(club_id,activity_id,person_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS import_errors_club_batch_idx ON miclub.import_errors(club_id,batch_id);
