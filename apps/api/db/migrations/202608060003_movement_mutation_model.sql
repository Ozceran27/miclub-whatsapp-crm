BEGIN;
ALTER TABLE miclub.movements ADD COLUMN IF NOT EXISTS reconciled_at timestamptz, ADD COLUMN IF NOT EXISTS voided_at timestamptz,
 ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES miclub.users(id), ADD COLUMN IF NOT EXISTS void_reason text;
CREATE INDEX IF NOT EXISTS movements_club_reconciled_idx ON miclub.movements(club_id,reconciled_at) WHERE reconciled_at IS NOT NULL;
CREATE OR REPLACE FUNCTION miclub.protect_finalized_movement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.reconciled_at IS NOT NULL OR EXISTS (SELECT 1 FROM miclub.payment_allocations WHERE movement_id=OLD.id) THEN
   RAISE EXCEPTION 'reconciled or payment-linked movement is immutable' USING ERRCODE='55000';
 END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS movements_protect_finalized ON miclub.movements;
CREATE TRIGGER movements_protect_finalized BEFORE UPDATE ON miclub.movements FOR EACH ROW EXECUTE FUNCTION miclub.protect_finalized_movement();

CREATE OR REPLACE FUNCTION miclub.validate_movement_void() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.voided_at IS NOT NULL AND (NEW.operational_status::text <> 'ANULADO' OR NEW.void_reason IS NULL OR btrim(NEW.void_reason)='') THEN RAISE EXCEPTION 'void movement requires ANULADO status and reason' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS movements_validate_void ON miclub.movements;
CREATE TRIGGER movements_validate_void BEFORE INSERT OR UPDATE ON miclub.movements FOR EACH ROW EXECUTE FUNCTION miclub.validate_movement_void();
COMMIT;
