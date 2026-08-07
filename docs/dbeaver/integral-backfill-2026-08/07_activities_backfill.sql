/* DBeaver/manual | 07 | Propaga club desde sector sin inventar responsable,
   modalidad ni comisión. Compatible con status text y miclub.entity_status. */
ROLLBACK;
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='10min';

-- La migración histórica comparaba el enum entity_status con literales ingleses
-- inválidos. Comparar ::text mantiene compatibilidad con ambos schemas.
CREATE OR REPLACE FUNCTION miclub.validate_activity_mutation()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF NEW.club_commission_percent < 0 OR NEW.club_commission_percent > 100 THEN
   RAISE EXCEPTION 'club_commission_percent must be between 0 and 100' USING ERRCODE='23514';
 END IF;
 IF NEW.status::text IN ('active','activa') AND NEW.manager_person_id IS NULL
    AND (TG_OP='INSERT' OR OLD.status::text NOT IN ('active','activa')
      OR NEW.manager_person_id IS DISTINCT FROM OLD.manager_person_id) THEN
   RAISE EXCEPTION 'active activity requires manager_person_id' USING ERRCODE='23514';
 END IF;
 IF NEW.archived_at IS NOT NULL AND NEW.status::text NOT IN ('archived','cancelada') THEN
   RAISE EXCEPTION 'archived activity must have archived/cancelada status' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $fn$;

DO $backfill$
BEGIN
 IF EXISTS(
   SELECT FROM miclub.activities a JOIN miclub.sectors s ON s.id=a.sector_id
   WHERE a.club_id IS NOT NULL AND a.club_id<>s.club_id
 ) THEN
   RAISE EXCEPTION 'BLOCKER: activity/sector cross-tenant preexistente';
 END IF;
 UPDATE miclub.activities a SET club_id=s.club_id,updated_at=now()
 FROM miclub.sectors s
 WHERE a.club_id IS NULL AND a.sector_id=s.id AND s.club_id IS NOT NULL;
 IF EXISTS(SELECT FROM miclub.activities a JOIN miclub.sectors s ON s.id=a.sector_id WHERE a.club_id<>s.club_id) THEN
   RAISE EXCEPTION 'BLOCKER: activity/sector cross-tenant';
 END IF;
END $backfill$;

SELECT id,code,name,status::text status,manager_person_id,instructor_id,
 club_commission_percent,instructor_commission_percent,
 CASE WHEN manager_person_id IS NULL OR instructor_id IS NULL THEN 'MANUAL_REVIEW' ELSE 'AUTO_FIX_SAFE' END decision
FROM miclub.activities WHERE manager_person_id IS NULL OR instructor_id IS NULL;
COMMIT;
