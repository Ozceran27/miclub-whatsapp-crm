/* Destructive-looking integration test; all changes are rolled back.
   Run only after 05, as a database owner/admin able to SET ROLE miclub_runtime.
   Requires at least two clubs with people and one employee in the first club. */
BEGIN;
SET LOCAL statement_timeout='2min';

DO $fixtures$
DECLARE club_a uuid; club_b uuid; employee_a uuid; person_b uuid; leaked bigint;
BEGIN
 SELECT id INTO club_a FROM miclub.clubs ORDER BY id LIMIT 1;
 SELECT id INTO club_b FROM miclub.clubs WHERE id<>club_a ORDER BY id LIMIT 1;
 IF club_a IS NULL OR club_b IS NULL THEN RAISE EXCEPTION 'test requires two clubs'; END IF;
 SELECT id INTO employee_a FROM miclub.employees WHERE club_id=club_a LIMIT 1;
 SELECT id INTO person_b FROM miclub.people WHERE club_id=club_b LIMIT 1;
 IF employee_a IS NULL OR person_b IS NULL THEN
   RAISE EXCEPTION 'test requires an employee in club A and a person in club B';
 END IF;

 -- Persist fixture identifiers as transaction-local settings before assuming the
 -- restricted role; this does not expose tenant rows to that role.
 PERFORM set_config('app.test_club_a',club_a::text,true);
 PERFORM set_config('app.test_club_b',club_b::text,true);
 PERFORM set_config('app.test_employee_a',employee_a::text,true);
 PERFORM set_config('app.test_person_b',person_b::text,true);
END $fixtures$;

SET LOCAL ROLE miclub_runtime;
SELECT set_config('app.club_id',current_setting('app.test_club_a'),true);

-- Intentionally omits club_id. It must still be impossible to observe club B.
DO $rls_assertion$
DECLARE leaked bigint;
BEGIN
 SELECT count(*) INTO leaked FROM miclub.people
 WHERE club_id=current_setting('app.test_club_b')::uuid;
 IF leaked<>0 THEN RAISE EXCEPTION 'RLS FAILURE: unscoped query observed % rows from club B',leaked; END IF;
 IF EXISTS (SELECT FROM miclub.people WHERE club_id<>current_setting('app.club_id')::uuid) THEN
   RAISE EXCEPTION 'RLS FAILURE: bare SELECT crossed tenants';
 END IF;
END $rls_assertion$;

-- The UPDATE explicitly targets a club-A row but attempts to attach a club-B
-- person. RLS alone is not enough here: a composite tenant FK must reject it.
DO $fk_assertion$
BEGIN
 BEGIN
   UPDATE miclub.employees SET person_id=current_setting('app.test_person_b')::uuid
   WHERE id=current_setting('app.test_employee_a')::uuid;
   RAISE EXCEPTION 'COMPOSITE FK FAILURE: cross-club employee/person link was accepted';
 EXCEPTION WHEN foreign_key_violation THEN
   NULL; -- expected
 END;
END $fk_assertion$;
ROLLBACK;
