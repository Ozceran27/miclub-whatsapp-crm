-- DBeaver manual: cuentas financieras y saldos iniciales auditables.
-- Ejecutar como owner de miclub. El bloque es atómico y puede repetirse.
BEGIN;

INSERT INTO miclub.currencies (code, name, symbol) VALUES
  ('ARS', 'Peso argentino', '$'), ('USD', 'Dólar estadounidense', 'US$'),
  ('BRL', 'Real brasileño', 'R$'), ('EUR', 'Euro', '€')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, symbol = EXCLUDED.symbol;

ALTER TABLE miclub.clubs ADD COLUMN IF NOT EXISTS base_currency_code text;
UPDATE miclub.clubs SET base_currency_code = 'ARS' WHERE base_currency_code IS NULL;
ALTER TABLE miclub.clubs ALTER COLUMN base_currency_code SET DEFAULT 'ARS';
ALTER TABLE miclub.clubs ALTER COLUMN base_currency_code SET NOT NULL;
ALTER TABLE miclub.clubs DROP CONSTRAINT IF EXISTS clubs_base_currency_code_fkey;
ALTER TABLE miclub.clubs ADD CONSTRAINT clubs_base_currency_code_fkey
  FOREIGN KEY (base_currency_code) REFERENCES miclub.currencies(code);

CREATE TABLE IF NOT EXISTS miclub.financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES miclub.clubs(id),
  code text NOT NULL,
  name text NOT NULL,
  currency_code text NOT NULL REFERENCES miclub.currencies(code),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_accounts_club_code_key UNIQUE (club_id, code),
  CONSTRAINT financial_accounts_code_format CHECK (code = upper(code) AND code ~ '^[A-Z][A-Z0-9_]*$')
);
CREATE INDEX IF NOT EXISTS financial_accounts_club_status_idx
  ON miclub.financial_accounts (club_id, status, code);

INSERT INTO miclub.financial_accounts (club_id, code, name, currency_code)
SELECT c.id, seed.code, seed.name,
       CASE WHEN seed.code = 'USD_CASH' THEN 'USD' ELSE c.base_currency_code END
FROM miclub.clubs c
CROSS JOIN (VALUES ('CASH','Caja'), ('BANK','Banco'), ('USD_CASH','Caja USD')) seed(code,name)
ON CONFLICT (club_id, code) DO UPDATE
SET name = EXCLUDED.name, currency_code = EXCLUDED.currency_code, updated_at = now();

ALTER TABLE miclub.movements ADD COLUMN IF NOT EXISTS account_id uuid;
ALTER TABLE miclub.movements DROP CONSTRAINT IF EXISTS movements_account_id_fkey;
ALTER TABLE miclub.movements ADD CONSTRAINT movements_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES miclub.financial_accounts(id);
CREATE INDEX IF NOT EXISTS movements_club_account_completed_idx
  ON miclub.movements (club_id, account_id, movement_date)
  WHERE operational_status = 'COMPLETADO' AND voided_at IS NULL;
COMMENT ON COLUMN miclub.movements.payment_method_id IS
  'Canal o medio de pago; no representa la cuenta financiera/contable.';
COMMENT ON COLUMN miclub.movements.account_id IS
  'Cuenta financiera afectada; distinta del canal payment_method_id.';

CREATE TABLE IF NOT EXISTS miclub.opening_balance_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES miclub.clubs(id),
  revision integer NOT NULL CHECK (revision > 0),
  operation text NOT NULL CHECK (operation IN ('REPLACE','REVERSE')),
  status text NOT NULL DEFAULT 'APPLIED' CHECK (status IN ('APPLIED','SUPERSEDED','REVERSED')),
  replaces_batch_id uuid REFERENCES miclub.opening_balance_batches(id),
  reconciliation_status text NOT NULL DEFAULT 'PENDING' CHECK (reconciliation_status IN ('PENDING','RECONCILED')),
  idempotency_key text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT opening_balance_batches_club_revision_key UNIQUE (club_id, revision),
  CONSTRAINT opening_balance_batches_club_idempotency_key UNIQUE (club_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS miclub.opening_balance_movements (
  movement_id uuid PRIMARY KEY REFERENCES miclub.movements(id),
  batch_id uuid NOT NULL REFERENCES miclub.opening_balance_batches(id),
  reverses_movement_id uuid REFERENCES miclub.movements(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS opening_balance_one_account_per_batch_idx
  ON miclub.opening_balance_movements (batch_id, (coalesce(reverses_movement_id, movement_id)));

-- Autoridad de liquidez: únicamente movimientos completados, no operational_balances.
CREATE OR REPLACE VIEW miclub.v_financial_account_liquidity AS
SELECT a.club_id, a.id AS account_id, a.code, a.name, a.currency_code,
       coalesce(sum(CASE
         WHEN m.movement_type = 'EGRESOS' THEN -m.amount
         WHEN m.movement_type IN ('INGRESOS','CAPITAL') THEN m.amount
         ELSE 0 END), 0)::numeric(14,2) AS balance
FROM miclub.financial_accounts a
LEFT JOIN miclub.movements m ON m.club_id = a.club_id AND m.account_id = a.id
 AND m.operational_status = 'COMPLETADO' AND m.voided_at IS NULL
GROUP BY a.club_id, a.id, a.code, a.name, a.currency_code;
COMMENT ON TABLE miclub.operational_balances IS
  'Snapshot/cache reconciliable. La autoridad de liquidez es v_financial_account_liquidity.';

-- Reemplaza el conjunto completo CASH/BANK/USD_CASH. Siempre crea tres hechos,
-- incluso con importes cero. La clave hace seguro todo reintento.
CREATE OR REPLACE FUNCTION miclub.replace_opening_balances(
  p_club_id uuid, p_cash numeric, p_bank numeric, p_usd_cash numeric,
  p_idempotency_key text, p_created_by uuid DEFAULT NULL, p_operation text DEFAULT 'REPLACE'
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_batch uuid; v_previous uuid; v_revision integer;
BEGIN
  IF p_cash IS NULL OR p_bank IS NULL OR p_usd_cash IS NULL OR p_cash < 0 OR p_bank < 0 OR p_usd_cash < 0 THEN
    RAISE EXCEPTION 'Los saldos iniciales no pueden ser negativos';
  END IF;
  IF nullif(btrim(p_idempotency_key), '') IS NULL THEN RAISE EXCEPTION 'idempotency_key requerido'; END IF;
  IF p_operation NOT IN ('REPLACE','REVERSE') THEN RAISE EXCEPTION 'Operación inválida'; END IF;
  PERFORM 1 FROM miclub.clubs WHERE id=p_club_id FOR UPDATE;
  SELECT id INTO v_batch FROM miclub.opening_balance_batches
   WHERE club_id=p_club_id AND idempotency_key=p_idempotency_key;
  IF v_batch IS NOT NULL THEN RETURN v_batch; END IF;
  SELECT id INTO v_previous FROM miclub.opening_balance_batches
   WHERE club_id=p_club_id AND status='APPLIED' ORDER BY revision DESC LIMIT 1 FOR UPDATE;
  SELECT coalesce(max(revision),0)+1 INTO v_revision FROM miclub.opening_balance_batches WHERE club_id=p_club_id;
  INSERT INTO miclub.opening_balance_batches(club_id,revision,operation,replaces_batch_id,idempotency_key,created_by)
  VALUES(p_club_id,v_revision,p_operation,v_previous,p_idempotency_key,p_created_by) RETURNING id INTO v_batch;
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
  RETURN v_batch;
END $$;

-- REVERSE es explícito y auditado: reemplaza por el conjunto completo en cero.
CREATE OR REPLACE FUNCTION miclub.reverse_opening_balances(p_club_id uuid,p_idempotency_key text,p_created_by uuid DEFAULT NULL)
RETURNS uuid LANGUAGE sql AS $$ SELECT miclub.replace_opening_balances(p_club_id,0,0,0,p_idempotency_key,p_created_by,'REVERSE') $$;

ALTER TABLE miclub.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE miclub.opening_balance_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE miclub.opening_balance_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON miclub.financial_accounts;
CREATE POLICY tenant_isolation ON miclub.financial_accounts USING (club_id=nullif(current_setting('app.club_id',true),'')::uuid) WITH CHECK (club_id=nullif(current_setting('app.club_id',true),'')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON miclub.opening_balance_batches;
CREATE POLICY tenant_isolation ON miclub.opening_balance_batches USING (club_id=nullif(current_setting('app.club_id',true),'')::uuid) WITH CHECK (club_id=nullif(current_setting('app.club_id',true),'')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON miclub.opening_balance_movements;
CREATE POLICY tenant_isolation ON miclub.opening_balance_movements USING (EXISTS (SELECT 1 FROM miclub.opening_balance_batches b WHERE b.id=batch_id AND b.club_id=nullif(current_setting('app.club_id',true),'')::uuid));

COMMIT;

-- Validación posterior (operational_balances se compara, jamás se suma como autoridad).
SELECT * FROM miclub.v_financial_account_liquidity ORDER BY club_id, code;
