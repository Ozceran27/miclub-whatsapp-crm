/* DBeaver/manual | PostgreSQL >=14 | DB: miclub_gestion | schema: miclub
 Order: 02, only after approval of 01. Estimated: <1 min; DROP INDEX takes ACCESS EXCLUSIVE on index.
 Structural cleanup only: no backfill and no business/club data changes. */
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='2min';

-- Prior count/precondition: both indexes must exist and be structurally equivalent.
SELECT old.indexrelid::regclass AS redundant_index, canonical.indexrelid::regclass AS retained_index,
       old.indkey=canonical.indkey AND old.indclass=canonical.indclass AND
       old.indcollation=canonical.indcollation AND old.indoption=canonical.indoption AND
       old.indpred IS NOT DISTINCT FROM canonical.indpred AS equivalent
FROM pg_index old JOIN pg_index canonical ON canonical.indrelid=old.indrelid
WHERE old.indexrelid='miclub.tasks_active_due_idx'::regclass
  AND canonical.indexrelid='miclub.tasks_club_due_idx'::regclass;

DO $cleanup$
DECLARE same boolean;
BEGIN
 IF to_regclass('miclub.tasks_active_due_idx') IS NULL THEN RETURN; END IF;
 IF to_regclass('miclub.tasks_club_due_idx') IS NULL THEN
   RAISE EXCEPTION 'precondition failed: canonical tasks_club_due_idx is absent';
 END IF;
 SELECT o.indkey=c.indkey AND o.indclass=c.indclass AND o.indcollation=c.indcollation
    AND o.indoption=c.indoption AND o.indpred IS NOT DISTINCT FROM c.indpred INTO same
 FROM pg_index o,pg_index c WHERE o.indexrelid='miclub.tasks_active_due_idx'::regclass
 AND c.indexrelid='miclub.tasks_club_due_idx'::regclass;
 IF NOT same THEN RAISE EXCEPTION 'precondition failed: task indexes are not equivalent'; END IF;
 DROP INDEX miclub.tasks_active_due_idx;
END $cleanup$;
COMMIT;
