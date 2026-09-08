-- Corrective RC migration: tenant sequence on every opening/reversal movement.
-- Real database: execute manually in DBeaver, never through an unattended runner.
-- No business-row backfill or deletion. SQL and ledger entry are atomic in runner.
-- Before manual execution save pg_get_functiondef for replace_opening_balances
-- and pg_get_constraintdef for movements_amount_check as rollback evidence.
-- Rollback before COMMIT is safe. After successful business use do not restore the
-- old broken function; retain this fix or restore a verified pre-change backup.
BEGIN;
DO $precheck$
BEGIN
 IF to_regprocedure('miclub.next_tenant_sequence(uuid,text)') IS NULL
 OR to_regprocedure('miclub.replace_opening_balances(uuid,text,numeric,numeric,numeric,text,uuid,text)') IS NULL THEN
  RAISE EXCEPTION 'Missing canonical opening-balance/sequence prerequisites';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='miclub.movements'::regclass AND attname='sequence_number' AND attnotnull) THEN
  RAISE EXCEPTION 'Unexpected movement sequence schema';
 END IF;
END $precheck$;

-- Signed CAPITAL reversals preserve liquidity without recording an operational
-- expense. Negative amounts in ordinary movements remain forbidden. A deferred
-- constraint below requires an explicit same-tenant reversal relationship.
ALTER TABLE miclub.movements DROP CONSTRAINT movements_amount_check;
ALTER TABLE miclub.movements ADD CONSTRAINT movements_amount_check CHECK (
 amount >= 0 OR coalesce((movement_type='CAPITAL' AND source='onboarding'
 AND source_payload->>'operation'='REVERSE' AND account_id IS NOT NULL),false)
);

CREATE OR REPLACE FUNCTION miclub.replace_opening_balances(
  p_club_id uuid, p_currency_code text, p_cash numeric, p_bank numeric, p_usd_cash numeric,
  p_idempotency_key text, p_created_by uuid DEFAULT NULL, p_operation text DEFAULT 'REPLACE'
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_batch uuid; v_previous uuid; v_revision integer;
BEGIN
  IF p_currency_code IS NULL OR p_currency_code NOT IN ('ARS','USD','BRL','EUR') THEN
    RAISE EXCEPTION 'Moneda operativa no soportada';
  END IF;
  IF p_cash::text IN ('NaN','Infinity','-Infinity') OR p_bank::text IN ('NaN','Infinity','-Infinity') OR p_usd_cash::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Los saldos deben ser finitos'; END IF;
  IF p_cash IS NULL OR p_bank IS NULL OR p_usd_cash IS NULL OR p_cash < 0 OR p_bank < 0 OR p_usd_cash < 0 THEN
    RAISE EXCEPTION 'Los saldos iniciales no pueden ser negativos';
  END IF;
  IF nullif(btrim(p_idempotency_key), '') IS NULL THEN RAISE EXCEPTION 'idempotency_key requerido'; END IF;
  IF p_operation NOT IN ('REPLACE','REVERSE') THEN RAISE EXCEPTION 'Operación inválida'; END IF;
  PERFORM 1 FROM miclub.clubs WHERE id=p_club_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Club inexistente'; END IF;
  SELECT id INTO v_batch FROM miclub.opening_balance_batches
   WHERE club_id=p_club_id AND idempotency_key=p_idempotency_key;
  IF v_batch IS NOT NULL THEN RETURN v_batch; END IF;
  UPDATE miclub.clubs SET base_currency_code=p_currency_code,updated_at=now() WHERE id=p_club_id;
  INSERT INTO miclub.financial_accounts(club_id,code,name,currency_code)
  SELECT p_club_id, seed.code, seed.name, CASE WHEN seed.code='USD_CASH' THEN 'USD' ELSE p_currency_code END
  FROM (VALUES ('CASH','Caja'),('BANK','Banco'),('USD_CASH','Caja USD')) seed(code,name)
  ON CONFLICT (club_id,code) DO UPDATE SET name=excluded.name,currency_code=excluded.currency_code,updated_at=now();
  SELECT id INTO v_previous FROM miclub.opening_balance_batches
   WHERE club_id=p_club_id AND status='APPLIED' ORDER BY revision DESC LIMIT 1 FOR UPDATE;
  SELECT coalesce(max(revision),0)+1 INTO v_revision FROM miclub.opening_balance_batches WHERE club_id=p_club_id;
  INSERT INTO miclub.opening_balance_batches(club_id,revision,operation,replaces_batch_id,idempotency_key,created_by,operational_currency_code)
  VALUES(p_club_id,v_revision,p_operation,v_previous,p_idempotency_key,p_created_by,p_currency_code) RETURNING id INTO v_batch;
  IF v_previous IS NOT NULL THEN
    UPDATE miclub.opening_balance_batches SET status='SUPERSEDED' WHERE id=v_previous;
    WITH reversed AS (
      INSERT INTO miclub.movements(club_id,sequence_number,movement_date,movement_type,concept,amount,currency_code,account_id,
        financial_status,operational_status,source,source_payload,created_by,idempotency_key)
      SELECT m.club_id,miclub.next_tenant_sequence(p_club_id,'movement'),current_date,'CAPITAL','Reversión saldo inicial',-m.amount,m.currency_code,m.account_id,
        'pagado'::miclub.financial_status,'COMPLETADO','onboarding',jsonb_build_object('opening_balance',true,'operation','REVERSE','batch_id',v_batch),
        p_created_by,p_idempotency_key||':reverse:'||m.account_id
      FROM miclub.opening_balance_movements obm JOIN miclub.movements m ON m.id=obm.movement_id
      WHERE obm.batch_id=v_previous AND m.club_id=p_club_id AND obm.reverses_movement_id IS NULL RETURNING id, account_id)
    INSERT INTO miclub.opening_balance_movements(movement_id,batch_id,reverses_movement_id)
    SELECT r.id,v_batch,old.movement_id FROM reversed r JOIN miclub.opening_balance_movements old
      ON old.batch_id=v_previous AND old.reverses_movement_id IS NULL
      JOIN miclub.movements om ON om.id=old.movement_id AND om.account_id=r.account_id AND om.club_id=p_club_id;
  END IF;
  WITH amounts(code,amount) AS (VALUES ('CASH',p_cash),('BANK',p_bank),('USD_CASH',p_usd_cash)), inserted AS (
    INSERT INTO miclub.movements(club_id,sequence_number,movement_date,movement_type,concept,amount,currency_code,account_id,
      financial_status,operational_status,source,source_payload,created_by,idempotency_key)
    SELECT p_club_id,miclub.next_tenant_sequence(p_club_id,'movement'),current_date,'CAPITAL','Saldo inicial',x.amount,a.currency_code,a.id,
      'pagado'::miclub.financial_status,'COMPLETADO','onboarding',jsonb_build_object('opening_balance',true,'operation','REPLACE','batch_id',v_batch),
      p_created_by,p_idempotency_key||':'||a.code
    FROM amounts x JOIN miclub.financial_accounts a ON a.club_id=p_club_id AND a.code=x.code AND a.status='ACTIVE'
    RETURNING id)
  INSERT INTO miclub.opening_balance_movements(movement_id,batch_id) SELECT id,v_batch FROM inserted;
  IF (SELECT count(*) FROM miclub.opening_balance_movements WHERE batch_id=v_batch AND reverses_movement_id IS NULL) <> 3 THEN
    RAISE EXCEPTION 'Se requieren las cuentas activas CASH, BANK y USD_CASH';
  END IF;
  UPDATE miclub.opening_balance_batches SET reconciliation_status='RECONCILED' WHERE id=v_batch;
  RETURN v_batch;
END $$;


CREATE OR REPLACE FUNCTION miclub.reverse_opening_balances(p_club_id uuid,p_idempotency_key text,p_created_by uuid DEFAULT NULL)
RETURNS uuid LANGUAGE sql AS $$
  SELECT miclub.replace_opening_balances(p_club_id,c.base_currency_code,0,0,0,p_idempotency_key,p_created_by,'REVERSE')
  FROM miclub.clubs c WHERE c.id=p_club_id
$$;


CREATE OR REPLACE FUNCTION miclub.validate_opening_reversal() RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM miclub.movements WHERE id=NEW.id AND amount<0) THEN RETURN NULL; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM miclub.opening_balance_movements link
  JOIN miclub.opening_balance_batches batch ON batch.id=link.batch_id
  JOIN miclub.movements original ON original.id=link.reverses_movement_id
  JOIN miclub.opening_balance_movements original_link ON original_link.movement_id=original.id AND original_link.reverses_movement_id IS NULL
  WHERE link.movement_id=NEW.id AND batch.club_id=NEW.club_id
   AND original.club_id=NEW.club_id AND original.account_id=NEW.account_id
   AND original.currency_code=NEW.currency_code AND NEW.amount=-original.amount
   AND original.movement_type='CAPITAL' AND original.source='onboarding'
   AND batch.replaces_batch_id=original_link.batch_id
   AND NEW.source_payload->>'batch_id'=batch.id::text
 ) THEN RAISE EXCEPTION 'Opening reversal must negate its original tenant/account movement' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $guard$;
DROP TRIGGER IF EXISTS movements_validate_opening_reversal ON miclub.movements;
CREATE CONSTRAINT TRIGGER movements_validate_opening_reversal AFTER INSERT OR UPDATE ON miclub.movements
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.amount<0) EXECUTE FUNCTION miclub.validate_opening_reversal();
DO $postcheck$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('miclub.replace_opening_balances(uuid,text,numeric,numeric,numeric,text,uuid,text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,'miclub.next_tenant_sequence','')))/length('miclub.next_tenant_sequence') <> 2 THEN
  RAISE EXCEPTION 'Opening and reversal inserts must both assign a tenant sequence';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='miclub.movements'::regclass AND tgname='movements_validate_opening_reversal' AND tgdeferrable AND tginitdeferred) THEN
  RAISE EXCEPTION 'Missing reversal relationship guard';
 END IF;
END $postcheck$;
COMMIT;
