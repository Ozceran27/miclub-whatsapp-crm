/* Tenant sólo si person y activity coinciden; contradicciones abortan. */
BEGIN; DO $$ BEGIN
 IF EXISTS(SELECT FROM miclub.enrollments e JOIN miclub.people p ON p.id=e.person_id JOIN miclub.activities a ON a.id=e.activity_id WHERE p.club_id IS DISTINCT FROM a.club_id) THEN RAISE EXCEPTION 'BLOCKER: persona y actividad de inscripción pertenecen a clubs distintos'; END IF;
 UPDATE miclub.enrollments e SET club_id=p.club_id,updated_at=now() FROM miclub.people p,miclub.activities a WHERE e.club_id IS NULL AND p.id=e.person_id AND a.id=e.activity_id AND p.club_id=a.club_id AND p.club_id IS NOT NULL;
END $$;
SELECT count(*) unresolved FROM miclub.enrollments WHERE club_id IS NULL OR person_id IS NULL OR activity_id IS NULL;
COMMIT;
