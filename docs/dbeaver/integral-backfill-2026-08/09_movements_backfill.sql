/* Sólo club determinístico. Protege fingerprint económico antes/después. */
BEGIN; CREATE TEMP TABLE financial_guard AS SELECT count(*) n,sum(amount) total,md5(string_agg(id::text||'|'||amount::text||'|'||movement_date::text||'|'||external_id,';' ORDER BY id)) fp FROM miclub.movements;
DO $$ DECLARE target uuid; BEGIN SELECT id INTO STRICT target FROM miclub.clubs WHERE is_active AND lower(btrim(name))='miclub';
 IF EXISTS(SELECT FROM miclub.movements WHERE club_id IS NOT NULL AND club_id<>target) THEN RAISE EXCEPTION 'BLOCKER: movimientos de otro tenant'; END IF;
 IF to_regprocedure('miclub.movement_has_payment_allocation(uuid)') IS NULL THEN RAISE EXCEPTION 'BLOCKER: ejecute primero 04_sectors_backfill.sql completo'; END IF;
 IF EXISTS(SELECT FROM miclub.movements m WHERE m.club_id IS NULL AND (m.reconciled_at IS NOT NULL OR miclub.movement_has_payment_allocation(m.id))) THEN RAISE EXCEPTION 'BLOCKER: trigger de inmutabilidad impide actualizar movimientos finalizados; requiere estrategia manual revisada'; END IF;
 UPDATE miclub.movements SET club_id=target,updated_at=now() WHERE club_id IS NULL;
 IF EXISTS(SELECT FROM financial_guard g CROSS JOIN (SELECT count(*) n,sum(amount) total,md5(string_agg(id::text||'|'||amount::text||'|'||movement_date::text||'|'||external_id,';' ORDER BY id)) fp FROM miclub.movements)n WHERE (g.n,g.total,g.fp) IS DISTINCT FROM (n.n,n.total,n.fp)) THEN RAISE EXCEPTION 'FINANCIAL_IMMUTABLE guard failed'; END IF;
END $$; SELECT * FROM financial_guard; COMMIT;
