/* Propaga tenant desde person_id; no crea cuenta, empleo, salario ni instructor. */
BEGIN; DO $$ BEGIN
 UPDATE miclub.instructors i SET club_id=p.club_id,updated_at=now() FROM miclub.people p WHERE i.club_id IS NULL AND i.person_id=p.id AND p.club_id IS NOT NULL;
 UPDATE miclub.employees e SET club_id=p.club_id,updated_at=now() FROM miclub.people p WHERE e.club_id IS NULL AND e.person_id=p.id AND p.club_id IS NOT NULL;
 IF EXISTS(SELECT FROM miclub.instructors i JOIN miclub.people p ON p.id=i.person_id WHERE i.club_id<>p.club_id)
 OR EXISTS(SELECT FROM miclub.employees e JOIN miclub.people p ON p.id=e.person_id WHERE e.club_id<>p.club_id) THEN RAISE EXCEPTION 'BLOCKER: relación laboral/instructor cross-tenant'; END IF;
END $$;
SELECT 'instructors_unresolved',count(*) FROM miclub.instructors WHERE club_id IS NULL OR person_id IS NULL
UNION ALL SELECT 'employees_unresolved',count(*) FROM miclub.employees WHERE club_id IS NULL OR person_id IS NULL;
COMMIT;
