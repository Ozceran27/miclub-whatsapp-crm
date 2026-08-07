/* Endurecimiento opcional: falla sin alterar si quedan huérfanos. */
BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15min';
DO $$ DECLARE t text; n bigint; BEGIN
 FOREACH t IN ARRAY ARRAY['people','sectors','instructors','activities','enrollments','movements','import_batches','import_errors'] LOOP
  EXECUTE format('SELECT count(*) FROM miclub.%I WHERE club_id IS NULL',t) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'BLOCKER: %.club_id tiene % NULL',t,n; END IF;
  EXECUTE format('ALTER TABLE miclub.%I ALTER COLUMN club_id SET NOT NULL',t);
 END LOOP;
END $$;
COMMIT;
