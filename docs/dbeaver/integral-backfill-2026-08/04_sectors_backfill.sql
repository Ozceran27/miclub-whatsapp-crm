/* Mapa auditable: code primero, nombre sólo se reporta. No inserta sectores.
   Compatibiliza instalaciones donde payment_allocations no posee movement_id. */
ROLLBACK;
BEGIN; SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION miclub.movement_has_payment_allocation(target_movement_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE AS $fn$
DECLARE linked boolean := false;
BEGIN
 IF NOT EXISTS(SELECT FROM information_schema.columns WHERE table_schema='miclub' AND table_name='payment_allocations' AND column_name='movement_id') THEN RETURN false; END IF;
 EXECUTE 'SELECT EXISTS(SELECT FROM miclub.payment_allocations WHERE movement_id=$1)' INTO linked USING target_movement_id;
 RETURN linked;
END $fn$;
CREATE OR REPLACE FUNCTION miclub.protect_finalized_movement() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF OLD.reconciled_at IS NOT NULL OR miclub.movement_has_payment_allocation(OLD.id) THEN
   RAISE EXCEPTION 'reconciled or payment-linked movement is immutable' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $fn$;
CREATE TEMP TABLE legacy_sector_map(legacy_sector_id uuid PRIMARY KEY,new_sector_id uuid NOT NULL,match_basis text NOT NULL CHECK(match_basis IN('CODE','EXISTING_RELATION')));
-- Complete manualmente INSERTs aquí sólo tras revisar 01; vacío es válido.
DO $$ DECLARE target uuid; BEGIN SELECT id INTO STRICT target FROM miclub.clubs WHERE is_active AND lower(btrim(name))='miclub';
 IF EXISTS(SELECT FROM legacy_sector_map m LEFT JOIN miclub.sectors old ON old.id=m.legacy_sector_id LEFT JOIN miclub.sectors new ON new.id=m.new_sector_id WHERE old.id IS NULL OR new.id IS NULL OR new.club_id<>target OR m.legacy_sector_id=m.new_sector_id) THEN RAISE EXCEPTION 'mapa sector inválido'; END IF;
 IF EXISTS(SELECT lower(btrim(code)) FROM miclub.sectors WHERE code IS NOT NULL AND (club_id=target OR club_id IS NULL) GROUP BY 1 HAVING count(*)>1)
 OR EXISTS(SELECT lower(btrim(name)) FROM miclub.sectors WHERE club_id=target OR club_id IS NULL GROUP BY 1 HAVING count(*)>1) THEN RAISE EXCEPTION 'MANUAL_REVIEW: asignar club_id produciría sectores duplicados'; END IF;
 IF EXISTS(SELECT FROM legacy_sector_map m JOIN miclub.movements x ON x.sector_id=m.legacy_sector_id WHERE x.reconciled_at IS NOT NULL OR miclub.movement_has_payment_allocation(x.id)) THEN RAISE EXCEPTION 'BLOCKER: el mapa intenta mutar movimientos financieros protegidos'; END IF;
 UPDATE miclub.sectors SET club_id=target,updated_at=now() WHERE club_id IS NULL;
 UPDATE miclub.activities a SET sector_id=m.new_sector_id FROM legacy_sector_map m WHERE a.sector_id=m.legacy_sector_id AND a.club_id IS NULL;
 UPDATE miclub.movements x SET sector_id=m.new_sector_id FROM legacy_sector_map m WHERE x.sector_id=m.legacy_sector_id AND x.club_id IS NULL;
END $$;
SELECT * FROM legacy_sector_map; COMMIT;
