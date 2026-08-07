/* Sólo tenant; nunca fusiona ni borra personas. Duplicados bloquean constraints. */
BEGIN; DO $$ DECLARE target uuid; BEGIN SELECT id INTO STRICT target FROM miclub.clubs WHERE is_active AND lower(btrim(name))='miclub';
 IF EXISTS(SELECT normalized_dni FROM miclub.people WHERE club_id=target AND normalized_dni IS NOT NULL GROUP BY 1 HAVING count(*)>1) THEN RAISE EXCEPTION 'MANUAL_REVIEW: DNI duplicado; no se fusionó'; END IF;
 INSERT INTO miclub.club_memberships(club_id,person_id,status,joined_at,metadata)
 SELECT target,p.id,'active',p.created_at,jsonb_build_object('backfill','2026-08-integral-v1') FROM miclub.people p
 WHERE p.club_id=target AND NOT EXISTS(SELECT FROM miclub.club_memberships cm WHERE cm.club_id=target AND cm.person_id=p.id)
 ON CONFLICT(club_id,person_id) DO NOTHING;
END $$; COMMIT;
