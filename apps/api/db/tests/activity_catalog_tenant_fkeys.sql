-- Integration regression for a migrated database. All fixtures are rolled back.
BEGIN;

DO $test$
DECLARE
  club_a uuid := gen_random_uuid();
  club_b uuid := gen_random_uuid();
  person_a uuid;
  person_b uuid;
  instructor_a uuid;
  instructor_b uuid;
  sector_a uuid;
  sector_b uuid;
  activity_a uuid;
  rejected boolean;
BEGIN
  INSERT INTO miclub.clubs (id, code, name) VALUES
    (club_a, 'activity-fk-a-' || club_a, 'Activity FK tenant A'),
    (club_b, 'activity-fk-b-' || club_b, 'Activity FK tenant B');

  INSERT INTO miclub.people (club_id, first_name, last_name)
  VALUES (club_a, 'FK', 'Manager A') RETURNING id INTO person_a;
  INSERT INTO miclub.people (club_id, first_name, last_name)
  VALUES (club_b, 'FK', 'Manager B') RETURNING id INTO person_b;

  INSERT INTO miclub.instructors (club_id, person_id, display_name) VALUES
    (club_a, person_a, 'Instructor A'), (club_b, person_b, 'Instructor B');
  SELECT id INTO instructor_a FROM miclub.instructors WHERE club_id = club_a AND person_id = person_a;
  SELECT id INTO instructor_b FROM miclub.instructors WHERE club_id = club_b AND person_id = person_b;

  INSERT INTO miclub.sectors (club_id, code, name) VALUES
    (club_a, 'FK-A', 'Sector A'), (club_b, 'FK-B', 'Sector B');
  SELECT id INTO sector_a FROM miclub.sectors WHERE club_id = club_a AND code = 'FK-A';
  SELECT id INTO sector_b FROM miclub.sectors WHERE club_id = club_b AND code = 'FK-B';

  INSERT INTO miclub.activities
    (club_id, sector_id, manager_person_id, instructor_id, name)
  VALUES (club_a, sector_a, person_a, instructor_a, 'Composite FK fixture')
  RETURNING id INTO activity_a;

  rejected := false;
  BEGIN
    UPDATE miclub.activities SET sector_id = sector_b WHERE id = activity_a;
  EXCEPTION WHEN foreign_key_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'cross-tenant sector was accepted'; END IF;

  rejected := false;
  BEGIN
    UPDATE miclub.activities SET instructor_id = instructor_b WHERE id = activity_a;
  EXCEPTION WHEN foreign_key_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'cross-tenant instructor was accepted'; END IF;

  rejected := false;
  BEGIN
    UPDATE miclub.activities SET manager_person_id = person_b WHERE id = activity_a;
  EXCEPTION WHEN foreign_key_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'cross-tenant manager was accepted'; END IF;

  -- Catalog records remain available for historical references and are archived
  -- logically where supported; physical deletion is explicitly restricted.
  UPDATE miclub.sectors SET archived_at = now(), status = 'archived' WHERE id = sector_a;
  rejected := false;
  BEGIN
    DELETE FROM miclub.sectors WHERE id = sector_a;
  EXCEPTION WHEN restrict_violation OR foreign_key_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'referenced sector deletion was accepted'; END IF;

  rejected := false;
  BEGIN
    DELETE FROM miclub.instructors WHERE id = instructor_a;
  EXCEPTION WHEN restrict_violation OR foreign_key_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'referenced instructor deletion was accepted'; END IF;

  rejected := false;
  BEGIN
    DELETE FROM miclub.people WHERE id = person_a;
  EXCEPTION WHEN restrict_violation OR foreign_key_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'referenced manager deletion was accepted'; END IF;
END $test$;

ROLLBACK;
