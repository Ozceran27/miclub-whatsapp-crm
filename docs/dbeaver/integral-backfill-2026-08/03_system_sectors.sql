/* DBeaver/manual | 03 | Crea o protege únicamente los sectores de sistema
   definidos por la arquitectura actual: OTROS, ADMINISTRACION y TESORERIA.
   Seguro para reintento: primero reutiliza una coincidencia única por code/name
   normalizados; sólo inserta cuando no existe ninguna. Sólo completa club_id NULL. */
ROLLBACK; -- recupera una sesión DBeaver que quedó en estado 25P02
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='5min';

CREATE TEMP TABLE required_system_sectors(code text PRIMARY KEY,name text NOT NULL) ON COMMIT DROP;
INSERT INTO required_system_sectors(code,name) VALUES
 ('OTROS','OTROS'),('ADMINISTRACION','ADMINISTRACIÓN'),('TESORERIA','TESORERÍA');

CREATE TEMP TABLE system_sector_decisions(
 code text PRIMARY KEY,existing_id uuid,decision text NOT NULL,final_id uuid
) ON COMMIT DROP;

DO $block$
DECLARE target uuid; actor_user uuid; actor_person uuid; membership uuid; req record; matches integer; matched_id uuid; matched_club uuid; inserted_id uuid;
BEGIN
 SELECT id INTO STRICT target FROM miclub.clubs
 WHERE is_active AND lower(btrim(name))='miclub';
 IF (SELECT count(*) FROM miclub.clubs WHERE is_active)<>1 THEN
   RAISE EXCEPTION 'BLOCKER: debe existir exactamente un club activo';
 END IF;
 SELECT m.user_id,m.id INTO STRICT actor_user,membership
 FROM miclub.user_club_memberships m
 JOIN miclub.roles r ON r.id=m.role_id AND r.club_id=m.club_id
 WHERE m.club_id=target AND m.status='active' AND upper(btrim(r.code))='DIRECTOR';
 SELECT p.id INTO STRICT actor_person FROM miclub.people p
 WHERE p.club_id=target AND p.user_id=actor_user
   AND lower(btrim(p.first_name))='fernando' AND lower(btrim(p.last_name))='ramos';

 FOR req IN SELECT * FROM required_system_sectors ORDER BY code LOOP
   SELECT count(*),min(s.id::text)::uuid,min(s.club_id::text)::uuid INTO matches,matched_id,matched_club
   FROM miclub.sectors s
   WHERE (s.club_id=target OR s.club_id IS NULL) AND s.archived_at IS NULL
     AND (translate(upper(btrim(coalesce(s.code,''))),'ÁÉÍÓÚÜÑ','AEIOUUN')=req.code
       OR translate(upper(btrim(s.name)),'ÁÉÍÓÚÜÑ','AEIOUUN')=req.code);
   IF matches>1 THEN
     RAISE EXCEPTION 'MANUAL_REVIEW: % coincide con % sectores; no se modificó nada',req.code,matches;
   ELSIF matches=1 THEN
     -- sectors.created_by/updated_by referencian miclub.people, no miclub.users.
     UPDATE miclub.sectors SET club_id=target,is_system=true,updated_at=now(),updated_by=actor_person
     WHERE id=matched_id AND (club_id=target OR club_id IS NULL)
       AND (club_id IS NULL OR is_system IS DISTINCT FROM true);
     INSERT INTO system_sector_decisions VALUES(req.code,matched_id,
       CASE WHEN matched_club IS NULL THEN 'ADOPTED_NULL_TENANT' ELSE 'REUSED_AND_PROTECTED' END,matched_id);
   ELSE
     INSERT INTO miclub.sectors(club_id,code,name,status,capacity_mode,is_system,created_by,updated_by)
     VALUES(target,req.code,req.name,'active','none',true,actor_person,actor_person) RETURNING id INTO inserted_id;
     INSERT INTO system_sector_decisions VALUES(req.code,NULL,'CREATED_MISSING',inserted_id);
   END IF;
 END LOOP;

 IF (SELECT count(DISTINCT final_id) FROM system_sector_decisions)<>3 THEN
   RAISE EXCEPTION 'MANUAL_REVIEW: una fila coincide con más de una identidad de sistema';
 END IF;

 IF (SELECT count(*) FROM miclub.sectors s JOIN required_system_sectors r
     ON translate(upper(btrim(coalesce(s.code,''))),'ÁÉÍÓÚÜÑ','AEIOUUN')=r.code
       OR translate(upper(btrim(s.name)),'ÁÉÍÓÚÜÑ','AEIOUUN')=r.code
     WHERE s.club_id=target AND s.is_system AND s.archived_at IS NULL)<>3 THEN
   RAISE EXCEPTION 'validación final: no quedaron exactamente tres sectores de sistema';
 END IF;

 INSERT INTO miclub.audit_log(user_id,club_id,membership_id,action,entity_type,result,metadata)
 VALUES(actor_user,target,membership,'BACKFILL_DOMAIN_COMPLETED','system_sectors','success',
   jsonb_build_object('version','2026-08-integral-v2','script','03_system_sectors.sql',
     'decisions',(SELECT jsonb_agg(to_jsonb(d)) FROM system_sector_decisions d)));
END $block$;

SELECT code,existing_id,decision,final_id FROM system_sector_decisions ORDER BY code;
SELECT s.id,s.club_id,s.code,s.name,s.status,s.is_system,s.archived_at
FROM miclub.sectors s JOIN required_system_sectors r
 ON translate(upper(btrim(coalesce(s.code,''))),'ÁÉÍÓÚÜÑ','AEIOUUN')=r.code
   OR translate(upper(btrim(s.name)),'ÁÉÍÓÚÜÑ','AEIOUUN')=r.code
WHERE s.is_system ORDER BY r.code;
COMMIT;
