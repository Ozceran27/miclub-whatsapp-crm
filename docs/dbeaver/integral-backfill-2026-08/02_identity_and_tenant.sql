/* Valida identidad única y completa únicamente club_id NULL determinístico. */
BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15min';
DO $$ DECLARE target uuid; actor uuid; auth uuid; BEGIN
 SELECT id INTO target FROM miclub.clubs WHERE is_active AND lower(btrim(name))='miclub';
 IF (SELECT count(*) FROM miclub.clubs WHERE is_active)<>1 OR (SELECT count(*) FROM miclub.clubs WHERE is_active AND lower(btrim(name))='miclub')<>1 THEN RAISE EXCEPTION 'BLOCKER: se requiere un único club activo miClub'; END IF;
 SELECT u.id INTO actor FROM miclub.users u JOIN miclub.people p ON p.user_id=u.id AND p.club_id=target WHERE u.is_active AND lower(btrim(p.first_name))='fernando' AND lower(btrim(p.last_name))='ramos';
 IF actor IS NULL OR (SELECT count(DISTINCT u.id) FROM miclub.users u JOIN miclub.people p ON p.user_id=u.id AND p.club_id=target WHERE u.is_active AND lower(btrim(p.first_name))='fernando' AND lower(btrim(p.last_name))='ramos')<>1 THEN RAISE EXCEPTION 'BLOCKER: Fernando activo y person vinculada no son únicos'; END IF;
 SELECT m.id INTO auth FROM miclub.user_club_memberships m JOIN miclub.roles r ON r.id=m.role_id AND r.club_id=m.club_id WHERE m.user_id=actor AND m.club_id=target AND m.status='active' AND upper(r.code)='DIRECTOR';
 IF auth IS NULL OR (SELECT count(*) FROM miclub.user_club_memberships m JOIN miclub.roles r ON r.id=m.role_id AND r.club_id=m.club_id WHERE m.user_id=actor AND m.club_id=target AND m.status='active' AND upper(r.code)='DIRECTOR')<>1 THEN RAISE EXCEPTION 'BLOCKER: autorización DIRECTOR activa no es única'; END IF;
 IF EXISTS(SELECT FROM miclub.movements WHERE club_id IS NOT NULL AND club_id<>target) OR EXISTS(SELECT FROM miclub.enrollments WHERE club_id IS NOT NULL AND club_id<>target) THEN RAISE EXCEPTION 'BLOCKER: existen hechos asociados a otro tenant'; END IF;
 -- Sólo raíces históricas sin tenant. Hijos se propagan en scripts de dominio.
 UPDATE miclub.people SET club_id=target,updated_at=now() WHERE club_id IS NULL;
 UPDATE miclub.import_batches SET club_id=target WHERE club_id IS NULL;
 INSERT INTO miclub.audit_log(user_id,club_id,membership_id,action,entity_type,result,metadata)
 VALUES(actor,target,auth,'BACKFILL_STARTED','integral_backfill','success',jsonb_build_object('version','2026-08-integral-v1','script','02_identity_and_tenant.sql'));
END $$;
SELECT 'people_remaining' check_name,count(*) FROM miclub.people WHERE club_id IS NULL
UNION ALL SELECT 'batches_remaining',count(*) FROM miclub.import_batches WHERE club_id IS NULL;
COMMIT;
