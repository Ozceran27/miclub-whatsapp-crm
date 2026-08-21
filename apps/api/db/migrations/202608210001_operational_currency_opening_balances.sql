-- Persist the club's explicitly selected operating currency with each opening batch.
BEGIN;

ALTER TABLE miclub.opening_balance_batches
  ADD COLUMN IF NOT EXISTS operational_currency_code text REFERENCES miclub.currencies(code);
UPDATE miclub.opening_balance_batches b SET operational_currency_code=c.base_currency_code
FROM miclub.clubs c WHERE c.id=b.club_id AND b.operational_currency_code IS NULL;
ALTER TABLE miclub.opening_balance_batches ALTER COLUMN operational_currency_code SET NOT NULL;

DROP FUNCTION IF EXISTS miclub.reverse_opening_balances(uuid,text,uuid);
DROP FUNCTION IF EXISTS miclub.replace_opening_balances(uuid,numeric,numeric,numeric,text,uuid,text);

CREATE OR REPLACE FUNCTION miclub.replace_opening_balances(
  p_club_id uuid, p_currency_code text, p_cash numeric, p_bank numeric, p_usd_cash numeric,
  p_idempotency_key text, p_created_by uuid DEFAULT NULL, p_operation text DEFAULT 'REPLACE'
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_batch uuid; v_previous uuid; v_revision integer;
BEGIN
  IF p_currency_code IS NULL OR p_currency_code NOT IN ('ARS','USD','BRL','EUR') THEN
    RAISE EXCEPTION 'Moneda operativa no soportada';
  END IF;
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
      INSERT INTO miclub.movements(club_id,movement_date,movement_type,concept,amount,currency_code,account_id,
        financial_status,operational_status,source,source_payload,created_by,idempotency_key)
      SELECT m.club_id,current_date,'CAPITAL','Reversión saldo inicial',-m.amount,m.currency_code,m.account_id,
        'cobrado','COMPLETADO','onboarding',jsonb_build_object('opening_balance',true,'operation','REVERSE','batch_id',v_batch),
        p_created_by,p_idempotency_key||':reverse:'||m.account_id
      FROM miclub.opening_balance_movements obm JOIN miclub.movements m ON m.id=obm.movement_id
      WHERE obm.batch_id=v_previous AND obm.reverses_movement_id IS NULL RETURNING id, account_id)
    INSERT INTO miclub.opening_balance_movements(movement_id,batch_id,reverses_movement_id)
    SELECT r.id,v_batch,old.movement_id FROM reversed r JOIN miclub.opening_balance_movements old
      ON old.batch_id=v_previous JOIN miclub.movements om ON om.id=old.movement_id AND om.account_id=r.account_id;
  END IF;
  WITH amounts(code,amount) AS (VALUES ('CASH',p_cash),('BANK',p_bank),('USD_CASH',p_usd_cash)), inserted AS (
    INSERT INTO miclub.movements(club_id,movement_date,movement_type,concept,amount,currency_code,account_id,
      financial_status,operational_status,source,source_payload,created_by,idempotency_key)
    SELECT p_club_id,current_date,'CAPITAL','Saldo inicial',x.amount,a.currency_code,a.id,
      'cobrado','COMPLETADO','onboarding',jsonb_build_object('opening_balance',true,'operation','REPLACE','batch_id',v_batch),
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

COMMIT;
