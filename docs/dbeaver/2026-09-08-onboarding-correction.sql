-- RC onboarding corrective patch. Execute the WHOLE script manually in DBeaver.
-- No baseline, reset, tenant seed or historical ledger reconstruction.
-- Verify selected database and save backup/function definitions before execution.
-- Requires schema owner and access to the existing migration ledger.
-- All three changes and ONLY their executed ledger rows commit atomically.
-- On any error: ROLLBACK; do not continue individual statements.
-- Before COMMIT changes can be rolled back. After business use prefer a forward
-- fix; restoring old constraints rejects valid completed clubs and workers.
SELECT current_database(), current_user;
BEGIN;
SELECT pg_advisory_xact_lock(817320260908);
DO $ledger_precheck$
BEGIN
 IF to_regclass('public.miclub_schema_migrations') IS NULL THEN
  RAISE EXCEPTION 'Missing ledger: reconcile manually before applying; no history will be invented';
 END IF;
END $ledger_precheck$;

DO $checksum$ BEGIN
 IF EXISTS(SELECT 1 FROM public.miclub_schema_migrations WHERE name='202609080002_fix_opening_balance_sequences.sql' AND checksum<>'d8ed9e60cad1e4f0a96117da50993f0b927fabbe3b8378d3bd2f192b9bb85ce4') THEN
 RAISE EXCEPTION 'Conflicting checksum for 202609080002_fix_opening_balance_sequences.sql'; END IF;
 END $checksum$;
-- Corrective RC migration: tenant sequence on every opening/reversal movement.
-- Real database: execute manually in DBeaver, never through an unattended runner.
-- No business-row backfill or deletion. SQL and ledger entry are atomic in runner.
-- Before manual execution save pg_get_functiondef for replace_opening_balances
-- and pg_get_constraintdef for movements_amount_check as rollback evidence.
-- Rollback before COMMIT is safe. After successful business use do not restore the
-- old broken function; retain this fix or restore a verified pre-change backup.

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

INSERT INTO public.miclub_schema_migrations(name,checksum) VALUES('202609080002_fix_opening_balance_sequences.sql','d8ed9e60cad1e4f0a96117da50993f0b927fabbe3b8378d3bd2f192b9bb85ce4') ON CONFLICT(name) DO NOTHING;

DO $checksum$ BEGIN
 IF EXISTS(SELECT 1 FROM public.miclub_schema_migrations WHERE name='202609080003_retire_required_legacy_worker_payment.sql' AND checksum<>'280357a33c84e52a1b0665b8348951077d778fa8b55768f13ec214b29a7c03ea') THEN
 RAISE EXCEPTION 'Conflicting checksum for 202609080003_retire_required_legacy_worker_payment.sql'; END IF;
 END $checksum$;
-- Modern employee creation writes has_fixed_compensation, amount/frequency and
-- currency. Legacy payment_mode is retained for historical readers only.
-- No historical values are changed. Manual execution on the real DB in DBeaver.
-- Rollback before COMMIT: ROLLBACK. After new rows are created, restoring NOT NULL
-- would reject the canonical model; deploy a forward fix, never invent values.

DO $precheck$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='miclub.employees'::regclass AND conname='employees_fixed_compensation_check')
 OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='miclub.employees'::regclass AND conname='employees_fixed_compensation_currency_check') THEN
  RAISE EXCEPTION 'Canonical compensation constraints must exist before retiring legacy requirement';
 END IF;
END $precheck$;
ALTER TABLE miclub.employees ALTER COLUMN payment_mode DROP NOT NULL;
COMMENT ON COLUMN miclub.employees.payment_mode IS 'Legacy historical value. New writes use has_fixed_compensation, fixed_compensation_amount/frequency and currency_code.';
DO $postcheck$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='miclub.employees'::regclass AND attname='payment_mode' AND attnotnull) THEN
  RAISE EXCEPTION 'Legacy payment_mode still required';
 END IF;
END $postcheck$;

INSERT INTO public.miclub_schema_migrations(name,checksum) VALUES('202609080003_retire_required_legacy_worker_payment.sql','280357a33c84e52a1b0665b8348951077d778fa8b55768f13ec214b29a7c03ea') ON CONFLICT(name) DO NOTHING;

DO $checksum$ BEGIN
 IF EXISTS(SELECT 1 FROM public.miclub_schema_migrations WHERE name='202609080004_allow_seven_onboarding_steps.sql' AND checksum<>'e7aec4cbf6ba38f5eb97efd027ed9e011536cdc4f01db92d2c1b644fcb690c85') THEN
 RAISE EXCEPTION 'Conflicting checksum for 202609080004_allow_seven_onboarding_steps.sql'; END IF;
 END $checksum$;
-- Align persisted completion with the existing seven-step public contract.
-- Real DB: manual DBeaver execution. No existing progress is rewritten.
-- Rollback before COMMIT: ROLLBACK. After step 7 is saved, use a forward fix;
-- restoring the six-step constraint would reject legitimate completed clubs.

ALTER TABLE miclub.club_onboarding DROP CONSTRAINT club_onboarding_completed_steps_check;
ALTER TABLE miclub.club_onboarding ADD CONSTRAINT club_onboarding_completed_steps_check
 CHECK (completed_steps <@ ARRAY[1,2,3,4,5,6,7]::smallint[]);
DO $postcheck$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='miclub.club_onboarding'::regclass
 AND conname='club_onboarding_completed_steps_check' AND convalidated) THEN
  RAISE EXCEPTION 'Seven-step onboarding constraint not validated';
 END IF;
END $postcheck$;

INSERT INTO public.miclub_schema_migrations(name,checksum) VALUES('202609080004_allow_seven_onboarding_steps.sql','e7aec4cbf6ba38f5eb97efd027ed9e011536cdc4f01db92d2c1b644fcb690c85') ON CONFLICT(name) DO NOTHING;

COMMIT;
SELECT name,checksum,applied_at FROM public.miclub_schema_migrations WHERE name IN ('202609080002_fix_opening_balance_sequences.sql','202609080003_retire_required_legacy_worker_payment.sql','202609080004_allow_seven_onboarding_steps.sql') ORDER BY name;
